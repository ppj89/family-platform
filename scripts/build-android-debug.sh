#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JDK_HOME="$ROOT/.tools/jdk-21/jdk-21.0.11+10"
ANDROID_SDK="$ROOT/.tools/android-sdk"

if [ ! -d "$JDK_HOME" ]; then
  echo "Android build JDK not found: $JDK_HOME" >&2
  exit 1
fi

if [ ! -d "$ANDROID_SDK" ]; then
  echo "Android SDK not found: $ANDROID_SDK" >&2
  exit 1
fi

export JAVA_HOME="$JDK_HOME"
export ANDROID_HOME="$ANDROID_SDK"
export ANDROID_SDK_ROOT="$ANDROID_SDK"
export PATH="$JDK_HOME/bin:$ANDROID_SDK/platform-tools:$PATH"

cd "$ROOT"
scripts/npm-tools.cmd run cap:android
(cd android && ./gradlew assembleDebug)

echo "Debug APK: $ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
