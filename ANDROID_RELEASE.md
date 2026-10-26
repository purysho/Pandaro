# Android release guide

## Project facts

| Item                 | Value                                                                                                                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Application ID       | `com.purysho.pandaro`                                                                                                                                                                                                                                        |
| Version              | `versionName` = `package.json` version (1.0.0); `versionCode` = major×10000 + minor×100 + patch (10000)                                                                                                                                                      |
| SDK levels           | `minSdk` 24 (Android 7.0), `compileSdk` 36, `targetSdk` 36. Google Play requires API 36 for new apps and updates from 31 August 2026 ([source](https://developer.android.com/google/play/requirements/target-sdk))                                           |
| Build                | Gradle 8.14.3 wrapper, Android Gradle Plugin from Capacitor 8.5, JDK 21                                                                                                                                                                                      |
| Release optimisation | R8 (`minifyEnabled`) and resource shrinking; runtime-referenced resources kept via `res/raw/keep.xml`                                                                                                                                                        |
| Icons                | Adaptive icon (foreground, background, monochrome for themed icons), round icon, Android 12+ splash screen                                                                                                                                                   |
| Permissions          | `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM` (user-granted, never requested by the app), `RECEIVE_BOOT_COMPLETED` (restore scheduled notifications after reboot), `WAKE_LOCK`, `VIBRATE` (haptics), `INTERNET` (Capacitor bridge default; unused by Pandaro) |

## Build

```bash
export ANDROID_HOME=/path/to/android-sdk     # platform 36 and build-tools 36 installed
npm ci
npm run android:build                         # build web, cap sync, lintRelease assembleDebug bundleRelease
```

Outputs:

- `android/app/build/outputs/apk/debug/app-debug.apk`, for sideloading tests;
- `android/app/build/outputs/bundle/release/app-release.aab`, the store upload, unsigned unless
  signing is configured;
- `android/app/build/reports/lint-results-release.html`.

You can also open the project in Android Studio with `npx cap open android`.

## Signing

Keystores and passwords never go into git. `android/keystore.properties`, `*.jks` and
`*.keystore` are git-ignored.

1. Create an upload key (once), and back it up somewhere safe:

   ```bash
   keytool -genkeypair -v -keystore ~/keys/pandaro-upload.jks -alias pandaro-upload \
     -keyalg RSA -keysize 4096 -validity 10000
   ```

2. Provide it to Gradle, either in `android/keystore.properties`:

   ```properties
   storeFile=/home/you/keys/pandaro-upload.jks
   storePassword=…
   keyAlias=pandaro-upload
   keyPassword=…
   ```

   or with environment variables: `PANDARO_KEYSTORE`, `PANDARO_KEYSTORE_PASSWORD`,
   `PANDARO_KEY_ALIAS` and `PANDARO_KEY_PASSWORD`.

3. Run `npm run android:build`. Gradle signs `app-release.aab` when the keystore exists.

4. Verify:

   ```bash
   jarsigner -verify android/app/build/outputs/bundle/release/app-release.aab
   ```

**Play App Signing:** enrol in Play App Signing. The key above is the _upload_ key; Google holds
the app signing key.

**CI signing:** the Android workflow signs automatically when the repository secrets
`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and
`ANDROID_KEY_PASSWORD` exist.

## Device test checklist (do this before every release)

Install the debug APK with `adb install -r app-debug.apk` and check on Android 14 or later, and
on one older device (Android 8 to 10) if you can:

- [ ] Launch shows the panda splash, then the timer, with no white flash, in both light and dark system themes.
- [ ] Status bar icons are readable in both themes; content clears the status bar, navigation bar and display cutout.
- [ ] Start a 1-minute focus session (Settings → Focus = 1). Leave the app open: chime plays, panda celebrates, the break is ready.
- [ ] Enable notifications in Settings and accept the system prompt. Start a 1-minute session, press Home, wait: one notification arrives at about 1 minute. Tap it: the app opens with the session completed and a "while you were away" notice.
- [ ] Start a session, then pause, reset or skip it in the background. No notification arrives.
- [ ] Lock the screen during a session; unlock after it ends. The time and history are correct, and the session is counted once.
- [ ] Force-stop the app during a session, reopen after the deadline: completed once, no chained sessions.
- [ ] Reboot during a session: the notification still arrives (or the session completes on next launch).
- [ ] Back button: closes Settings, then returns from Tasks to the Timer, then minimises the app. It never kills a running session.
- [ ] Keep screen on (Settings): the screen stays on while running and sleeps when paused.
- [ ] Export backup opens the share sheet; save to Files/Drive. Import that file: preview, merge, undo.
- [ ] Airplane mode: everything works.
- [ ] Rotate to landscape: the timer and controls are visible side by side.
- [ ] TalkBack: controls are announced with names; the timer reads its remaining minutes.
- [ ] Font size at maximum: nothing is cut off.

## Google Play submission

See [docs/store/google-play.md](docs/store/google-play.md) for the listing text, data safety
answers and assets.

1. Create the app in Play Console: name "Pandaro", category Productivity, free, no ads.
2. Complete App content:
   - privacy policy URL (host [PRIVACY.md](PRIVACY.md) publicly first);
   - ads: none;
   - content rating questionnaire (expected: Everyone);
   - target audience;
   - data safety: no data collected or shared.
3. **Exact alarms:** Pandaro does not use `USE_EXACT_ALARM`. If Play Console asks about
   `SCHEDULE_EXACT_ALARM`, explain that it is used to deliver the end-of-session reminder of a
   user-started timer on time, and that the app works with inexact delivery if the user does not
   grant it.
4. Upload the signed AAB to **Internal testing**. Add testers and run the device checklist on at
   least two devices.
5. Promote to Closed or Open testing as required for new personal developer accounts, then to
   Production.

## Known limitations

- Background notifications are scheduled by the OS. Without "Alarms & reminders" access they may
  arrive a few minutes late under Doze or battery saving.
- The chime only plays while the app is in the foreground. In the background, the system
  notification sound is used.
- Not verified on a physical device or emulator in the build environment (no KVM available). Run
  the checklist above.
