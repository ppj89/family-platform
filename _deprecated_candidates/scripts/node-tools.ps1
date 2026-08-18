$ErrorActionPreference = 'Stop'

$node = Join-Path $PSScriptRoot '..\.tools\node\node.exe'

if (-not (Test-Path $node)) {
  Write-Error 'Portable Node is missing. Install Node 22.12+ or run the setup step documented in README.md.'
}

& $node @args
