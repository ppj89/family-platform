# App Release Prep

The web app is prepared as a PWA and the Android wrapper is prepared with Capacitor.

## Debug APK

Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-android-debug.ps1
```

The APK is generated at:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Notes

- Backend Java remains Java 25.
- Android Gradle builds run with JDK 21 because the Android toolchain is not ready for Java 25 class files yet.
- Android SDK files live in `.tools/android-sdk` and are not committed.
- Release signing is not configured yet. Before Play Store upload, create a keystore, configure `release` signing, and build an AAB.
