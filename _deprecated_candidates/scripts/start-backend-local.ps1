$root = Resolve-Path "$PSScriptRoot\.."
Push-Location $root
try {
  docker compose up --build -d db api
  docker compose ps api
} finally {
  Pop-Location
}
