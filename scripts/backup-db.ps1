$ErrorActionPreference = "Stop"

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

$backupDir = Join-Path (Get-Location) "backups"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = Join-Path $backupDir "$database-$timestamp.dump"
$backupPath = [System.IO.Path]::GetFullPath($backupPath)

cmd /c "docker exec $container pg_dump -U $username -d $database -Fc > `"$backupPath`""

Write-Host "Database backup created: $backupPath"
