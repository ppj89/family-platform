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

## Release AAB

Create the local upload keystore once:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\create-android-keystore.ps1
```

Then copy `.env.android-signing.example` to `.env.android-signing` and fill in the real passwords.

Build the Play Store upload bundle:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-android-release.ps1
```

The AAB is generated at:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

Keep the keystore and `.env.android-signing` private. Losing the upload key can block future app updates.
