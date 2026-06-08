param(
  [string]$GoImage = "golang:1.26.4-alpine"
)

$ErrorActionPreference = "Stop"

function Assert-LastExitCode {
  param([string]$CommandName)

  if ($LASTEXITCODE -ne 0) {
    throw "$CommandName failed with exit code $LASTEXITCODE"
  }
}

Write-Host "Frontend dependency audit"
npm audit --audit-level=high
Assert-LastExitCode "npm audit"

Write-Host ""
Write-Host "Go vulnerability check"
$backendPath = (Resolve-Path "backend-go").Path
docker run --rm `
  -v "${backendPath}:/src" `
  -w /src `
  --entrypoint sh `
  $GoImage `
  -lc "/usr/local/go/bin/go run golang.org/x/vuln/cmd/govulncheck@latest ./..."
Assert-LastExitCode "govulncheck"

Write-Host ""
Write-Host "Security checks passed"
