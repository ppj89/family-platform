$ErrorActionPreference = "Stop"

$volume = $env:UPLOADS_VOLUME
if ([string]::IsNullOrWhiteSpace($volume)) {
  $volume = "family-platform_family_platform_uploads"
}

$backupDir = $env:BACKUP_DIR
if ([string]::IsNullOrWhiteSpace($backupDir)) {
  $backupDir = Join-Path (Get-Location) "backups"
}

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = Join-Path $backupDir "uploads-$timestamp.tar.gz"
$resolvedBackupDir = [System.IO.Path]::GetFullPath($backupDir)
$backupFile = [System.IO.Path]::GetFileName($backupPath)

docker run --rm `
  -v "${volume}:/data:ro" `
  -v "${resolvedBackupDir}:/backup" `
  alpine:3.22 `
  sh -c "cd /data && tar -czf /backup/$backupFile ."

Write-Host "Uploads backup created: $backupPath"
