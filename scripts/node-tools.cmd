@echo off
setlocal
set "NODE=%~dp0..\.tools\node\node.exe"
if not exist "%NODE%" (
  echo Portable Node is missing. Install Node 22.12+ or run the setup step documented in README.md.
  exit /b 1
)
"%NODE%" %*
