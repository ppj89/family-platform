@echo off
setlocal
set "NPM=%~dp0..\.tools\node\npm.cmd"
if not exist "%NPM%" (
  echo Portable Node is missing. Install Node 22.12+ or run the setup step documented in README.md.
  exit /b 1
)
set "PATH=%~dp0..\.tools\node;%PATH%"
"%NPM%" %*
