$ErrorActionPreference = 'Stop'

$nodeRoot = Join-Path $PSScriptRoot '..\.tools\node'
$npm = Join-Path $nodeRoot 'npm.cmd'

if (-not (Test-Path $npm)) {
  Write-Error 'Portable Node is missing. Install Node 22.12+ or run the setup step documented in README.md.'
}

$env:PATH = "$nodeRoot;$env:PATH"
& $npm @args
