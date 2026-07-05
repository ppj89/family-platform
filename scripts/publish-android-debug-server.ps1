param(
  [string]$AppUrl = "https://familyhistory.dedyn.io",
  [string]$ApiBaseUrl = "https://familyhistory.dedyn.io/api",
  [string]$ServerHost = "192.145.44.103",
  [string]$SshUser = "root",
  [string]$SshKeyPath = "$env:USERPROFILE\.ssh\family_platform_netcup_ed25519",
  [string]$RemoteApkName = "app-debug.apk"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

$buildScript = Join-Path $PSScriptRoot "build-android-debug-server.ps1"
& powershell -NoProfile -ExecutionPolicy Bypass -File $buildScript -AppUrl $AppUrl -ApiBaseUrl $ApiBaseUrl
if ($LASTEXITCODE -ne 0) {
  throw "Android debug build failed with exit code $LASTEXITCODE"
}

$apkPath = Join-Path $repoRoot "android\app\build\outputs\apk\debug\app-debug.apk"
if (!(Test-Path $apkPath)) {
  throw "APK not found: $apkPath"
}

$remoteTempPath = "/tmp/$RemoteApkName"
& scp -i $SshKeyPath -o BatchMode=yes $apkPath "${SshUser}@${ServerHost}:$remoteTempPath"
if ($LASTEXITCODE -ne 0) {
  throw "APK upload failed with exit code $LASTEXITCODE"
}

$remoteCommand = "set -eu; docker run --rm -v family_platform_prod_downloads:/downloads -v /tmp:/hosttmp alpine:3.22 sh -lc 'cp /hosttmp/$RemoteApkName /downloads/$RemoteApkName && chmod 0644 /downloads/$RemoteApkName && ls -lh /downloads/$RemoteApkName'; rm -f $remoteTempPath"

& ssh -i $SshKeyPath -o BatchMode=yes "${SshUser}@${ServerHost}" $remoteCommand
if ($LASTEXITCODE -ne 0) {
  throw "Remote publish failed with exit code $LASTEXITCODE"
}

$downloadUrl = "https://familyhistory.dedyn.io/downloads/$RemoteApkName"
Write-Host "Android debug APK published: $downloadUrl"
