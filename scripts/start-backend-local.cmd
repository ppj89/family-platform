@echo off
set "ROOT=%~dp0.."
pushd "%ROOT%"
docker compose up --build -d db api
docker compose ps api
popd
