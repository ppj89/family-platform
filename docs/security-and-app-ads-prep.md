# Security and App Ads Prep

## Password and account security

- User passwords must never be stored as plaintext.
- Email sign-up stores only `app_users.password_hash`.
- Password hashes are generated with bcrypt in the Go API.
- Login, password change, and password reset must compare or write bcrypt hashes only.
- API integration tests must verify that a newly registered password is not stored as plaintext and uses a bcrypt hash prefix.

## Auth hardening checklist

- Keep `APP_SECURITY_TOKEN_SECRET` at 48 or more random characters.
- Keep production CORS origins HTTPS-only and domain-specific.
- Keep email verification enabled for production email sign-up.
- Keep failed password attempt lockout enabled.
- Keep active session replacement explicit through the login confirmation flow.
- Do not expose raw API error details in user-facing screens.
- Do not show persistent in-page success or auth error banners after an action; use toast messages for transient results.
- Verify family-scoped data APIs return only records visible to the selected family group plus records owned by the current user where applicable.

## App ads prep

- AdMob app creation should be done before source integration: create or save the AdMob app, create ad units, then copy the issued app ID and ad unit IDs into environment/native build configuration.
- Do not hardcode ad IDs in React or Android source.
- Store ad app IDs and ad unit IDs in environment or native build config.
- Keep development/test ad IDs separate from production ad IDs.
- Add ad slots behind feature flags first; default to disabled until policy and layout are verified.
- Keep `VITE_ADS_ENABLED=false` by default. Only enable it after Google Play data safety, consent, privacy policy, and layout checks are complete.
- Keep `APP_ADMOB_APP_ID` empty until the Android SDK integration step. Do not add a production AdMob app ID to the manifest before the app is ready to show ads.
- Prepare `app-ads.txt` hosting on the production domain before enabling real ads.
- Prepare privacy policy copy for advertising identifiers and personalized/non-personalized ad consent.
- Add consent gating before showing personalized ads.
- Avoid placing ads where they block core family data entry flows.

## Future implementation order

1. Create or save the app in AdMob and issue Android ad units.
2. Keep real IDs outside Git and put them in deployment/build environment values.
3. Add the Google Mobile Ads SDK to Android only after app release basics are stable.
4. Add a shared ad slot component that reads `src/shared/ads/adConfig.ts`.
5. Verify test ads only on PC, tablet, mobile, and app WebView layouts.
6. Publish and verify `https://familyhistory.dedyn.io/app-ads.txt`.
7. Complete Google Play data safety and advertising disclosures.
8. Enable production ads only after the policy checklist is complete.
