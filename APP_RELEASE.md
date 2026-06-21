# App Release Prep

The web app is prepared as a PWA, and Android/iOS wrappers are prepared with Capacitor.

## Debug APK

Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-android-debug.ps1
```

The APK is generated at:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Build a debug APK that opens the current production app:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-android-debug-server.ps1
```

Build and publish it to the server download URL:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\publish-android-debug-server.ps1
```

Android test download:

```text
https://familyhistory.dedyn.io/downloads/app-debug.apk
```

The app opens `https://familyhistory.dedyn.io` by default so OAuth callbacks and session storage use the same origin as the web app.

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

## iOS

Windows can generate and sync the Capacitor iOS project files, but App Store builds require macOS with Xcode.

Sync the iOS app project:

```powershell
.\scripts\npm-tools.cmd run cap:ios
```

On a Mac, open the Xcode project:

```bash
npm run cap:open:ios
```

Then configure these in Xcode:

- Apple Developer Team
- Bundle identifier: `com.familyplatform.app`
- Signing certificate and provisioning profile
- App icon, launch screen, privacy strings, and App Store metadata

For App Store or TestFlight distribution, enroll in the Apple Developer Program and upload through Xcode Organizer or Transporter.
