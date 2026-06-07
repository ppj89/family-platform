# Cloudflare R2 Media Storage

Use this when the production server is small and media files should not fill the VPS disk.

## Create R2 Resources

1. Create a Cloudflare account.
2. Open R2 Object Storage.
3. Create a bucket, for example `family-platform-media`.
4. Create an R2 API token with object read/write access to that bucket.
5. Copy:
   - Account ID
   - Access key ID
   - Secret access key
   - Bucket name

R2 S3 endpoint format:

```text
https://<account-id>.r2.cloudflarestorage.com
```

## Production Environment

Edit `.env.production`:

```bash
APP_MEDIA_STORAGE_DRIVER=s3
APP_MEDIA_PUBLIC_URL_PREFIX=/api/media/files
APP_MEDIA_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
APP_MEDIA_S3_REGION=auto
APP_MEDIA_S3_BUCKET=family-platform-media
APP_MEDIA_S3_ACCESS_KEY_ID=<r2-access-key-id>
APP_MEDIA_S3_SECRET_ACCESS_KEY=<r2-secret-access-key>
```

Keeping `APP_MEDIA_PUBLIC_URL_PREFIX=/api/media/files` means the app continues to load files through the Go API. The bucket can stay private.

## Validate

```bash
scripts/validate-prod-config.sh .env.production
```

## Deploy

```bash
scripts/update-prod-https.sh
```

## Notes

- Keep the R2 bucket private at first.
- Do not commit `.env.production`.
- Use lifecycle rules later if old videos need automatic cleanup.
- For a public CDN later, set `APP_MEDIA_PUBLIC_URL_PREFIX` to the public R2/custom-domain URL and keep uploaded media URLs stable.
