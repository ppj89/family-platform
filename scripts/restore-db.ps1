param(
  [Parameter(Mandatory = $true)]
  [string]$BackupPath
)

$ErrorActionPreference = "Stop"

if (!(Test-Path $BackupPath)) {
  throw "Backup file not found: $BackupPath"
}

$container = $env:DB_CONTAINER
if ([string]::IsNullOrWhiteSpace($container)) {
  $container = "family-platform-db"
}

$database = $env:POSTGRES_DB
if ([string]::IsNullOrWhiteSpace($database)) {
  $database = "family_platform"
}

$username = $env:POSTGRES_USER
if ([string]::IsNullOrWhiteSpace($username)) {
  $username = "family_app"
}

$resolvedBackupPath = [System.IO.Path]::GetFullPath($BackupPath)

Write-Host "Restoring $resolvedBackupPath into $database on $container..."
cmd /c "docker exec -i $container pg_restore -U $username -d $database --clean --if-exists --no-owner < `"$resolvedBackupPath`""
Write-Host "Database restore completed."
