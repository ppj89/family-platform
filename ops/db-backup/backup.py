#!/usr/bin/env python3
"""Create a PostgreSQL dump in R2 and retain only a fixed number of days."""

from __future__ import annotations

import os
import subprocess
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


def positive_int(name: str, fallback: int) -> int:
    value = os.environ.get(name, str(fallback)).strip()
    try:
        parsed = int(value)
    except ValueError as exc:
        raise RuntimeError(f"{name} must be a positive integer") from exc
    if parsed <= 0:
        raise RuntimeError(f"{name} must be a positive integer")
    return parsed


def backup_prefix() -> str:
    return os.environ.get("APP_DB_BACKUP_PREFIX", "database-backups/").strip().strip("/") + "/"


def make_s3_client() -> Any:
    import boto3

    return boto3.client(
        "s3",
        endpoint_url=required("APP_MEDIA_S3_ENDPOINT").rstrip("/"),
        region_name=os.environ.get("APP_MEDIA_S3_REGION", "auto"),
        aws_access_key_id=required("APP_MEDIA_S3_ACCESS_KEY_ID"),
        aws_secret_access_key=required("APP_MEDIA_S3_SECRET_ACCESS_KEY"),
    )


def prune_expired(client: Any, bucket: str, prefix: str, cutoff: datetime) -> int:
    deleted = 0
    paginator = client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for item in page.get("Contents", []):
            key = item.get("Key", "")
            last_modified = item.get("LastModified")
            if not key.startswith(prefix) or not last_modified or last_modified > cutoff:
                continue
            client.delete_object(Bucket=bucket, Key=key)
            deleted += 1
    return deleted


def main() -> None:
    bucket = required("APP_MEDIA_S3_BUCKET")
    keep_days = positive_int("APP_DB_BACKUP_KEEP_DAYS", 7)
    prefix = backup_prefix()
    now = datetime.now(timezone.utc)
    backup_name = f"family-platform-{now.strftime('%Y%m%dT%H%M%SZ')}.dump"

    with tempfile.TemporaryDirectory(prefix="family-platform-db-") as temp_dir:
        dump_path = Path(temp_dir) / backup_name
        env = os.environ.copy()
        env["PGPASSWORD"] = required("POSTGRES_PASSWORD")
        subprocess.run(
            [
                "pg_dump",
                "-h", os.environ.get("POSTGRES_HOST", "db"),
                "-p", os.environ.get("POSTGRES_PORT", "5432"),
                "-U", required("POSTGRES_USER"),
                "-d", required("POSTGRES_DB"),
                "-Fc",
                "-Z", "9",
                "-f", str(dump_path),
            ],
            check=True,
            env=env,
        )
        client = make_s3_client()
        key = prefix + backup_name
        client.upload_file(str(dump_path), bucket, key, ExtraArgs={"ContentType": "application/octet-stream"})
        deleted = prune_expired(client, bucket, prefix, now - timedelta(days=keep_days))
        print(f"database backup completed: key={key} bytes={dump_path.stat().st_size} pruned={deleted}")


if __name__ == "__main__":
    main()
