import os
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import backup


class BackupCleanupTests(unittest.TestCase):
    def test_prune_expired_deletes_only_expired_backup_prefix_objects(self):
        client = MagicMock()
        client.get_paginator.return_value.paginate.return_value = [{
            "Contents": [
                {"Key": "database-backups/old.dump", "LastModified": datetime.now(timezone.utc) - timedelta(days=8)},
                {"Key": "database-backups/current.dump", "LastModified": datetime.now(timezone.utc) - timedelta(days=2)},
                {"Key": "media/current.jpg", "LastModified": datetime.now(timezone.utc) - timedelta(days=30)},
            ]
        }]

        deleted = backup.prune_expired(client, "family-platform-media", "database-backups/", datetime.now(timezone.utc) - timedelta(days=7))

        self.assertEqual(deleted, 1)
        client.delete_object.assert_called_once_with(Bucket="family-platform-media", Key="database-backups/old.dump")

    def test_backup_prefix_uses_the_dedicated_default_folder(self):
        previous = os.environ.pop("APP_DB_BACKUP_PREFIX", None)
        try:
            self.assertEqual(backup.backup_prefix(), "database-backups/")
        finally:
            if previous is not None:
                os.environ["APP_DB_BACKUP_PREFIX"] = previous


if __name__ == "__main__":
    unittest.main()
