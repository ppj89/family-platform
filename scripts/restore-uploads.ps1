param(
  [Parameter(Mandatory = $true)]
  [string]$BackupPath
)

$ErrorActionPreference = "Stop"

if (!(Test-Path $BackupPath)) {
  throw "Uploads backup not found: $BackupPath"
}

$volume = $env:UPLOADS_VOLUME
if ([string]::IsNullOrWhiteSpace($volume)) {
  $volume = "family_platform_prod_uploads"
}

$resolvedBackupPath = [System.IO.Path]::GetFullPath($BackupPath)
$backupDir = [System.IO.Path]::GetDirectoryName($resolvedBackupPath)
$backupFile = [System.IO.Path]::GetFileName($resolvedBackupPath)

Write-Host "Restoring $resolvedBackupPath into Docker volume $volume..."
docker run --rm `
  -v "${volume}:/data" `
  -v "${backupDir}:/backup:ro" `
  alpine:3.22 `
  sh -c "rm -rf /data/* && cd /data && tar -xzf /backup/$backupFile"

Write-Host "Uploads restore completed."
