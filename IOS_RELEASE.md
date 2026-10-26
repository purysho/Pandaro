# iOS release guide

> **Status:** the iOS project is generated and statically checked: the plists parse, the Xcode
> project parses with the `App` target, and icons and splash are generated. **No iOS binary has
> been built**, because that requires macOS with Xcode. Everything below has to be done on a Mac.

## Project facts

| Item              | Value                                                                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Bundle ID         | `com.purysho.pandaro` (change it in Xcode if you use a different team prefix)                                                           |
| Version           | `MARKETING_VERSION` 1.0.0, `CURRENT_PROJECT_VERSION` 1                                                                                  |
| Deployment target | iOS 15.0 (Capacitor 8 minimum)                                                                                                          |
| Toolchain         | Xcode 26 or later (required by Capacitor 8)                                                                                             |
| Dependencies      | Swift Package Manager (`ios/App/CapApp-SPM`); no CocoaPods                                                                              |
| Icons             | Single 1024×1024 universal app icon, no transparency                                                                                    |
| Launch            | `LaunchScreen.storyboard` with a light/dark splash image set                                                                            |
| Privacy           | `PrivacyInfo.xcprivacy`: no tracking, no collected data. `ITSAppUsesNonExemptEncryption = false`                                        |
| Permissions       | Notifications only, requested from Settings or the post-session prompt. No usage-description strings are needed for local notifications |

## Build and run

```bash
npm ci
npm run cap:sync          # builds the web app and copies it into ios/App/App/public
npx cap open ios          # opens ios/App/App.xcodeproj in Xcode
```

In Xcode:

1. Select the **App** target, then **Signing & Capabilities**. Choose your team and keep or
   adjust the bundle ID.
2. Wait for Swift packages to resolve (File → Packages → Resolve Package Versions).
3. Choose an iPhone simulator and press Run (⌘R). Also run on a real device.

## Device test checklist

- [ ] Launch: splash, then the timer, in both light and dark appearance; no white flash.
- [ ] Safe areas: header and tab bar clear the notch, Dynamic Island and home indicator in portrait and landscape.
- [ ] 1-minute focus session in the foreground: chime, celebration, break ready.
- [ ] Notifications: enable in Settings, accept the iOS prompt. Start 1 minute, go to the Home Screen: one notification arrives. Tap it: the app opens with the session completed once.
- [ ] Pause, reset or skip in the background: no notification.
- [ ] Swipe the app away during a session, reopen after the deadline: completed once, no chained sessions.
- [ ] Silent switch on: no chime (expected iOS behaviour for Web Audio).
- [ ] Keep screen on works while running.
- [ ] Export backup shows the share sheet; "Save to Files" works. Import the file back.
- [ ] Airplane mode: everything works.
- [ ] VoiceOver: all controls have names, and the timer announces its remaining minutes.
- [ ] Larger text: nothing is clipped.
- [ ] iPad: the two-column layout shows in landscape; split view works.

## App Store submission

Listing text, keywords, age rating and review notes are in
[docs/store/app-store.md](docs/store/app-store.md).

1. In App Store Connect, create the app with the bundle ID above, then fill in the privacy policy
   URL and support URL. You must host these; none are provided.
2. App Privacy: **Data Not Collected**.
3. In Xcode: Product → Archive, then Distribute App → App Store Connect → Upload.
4. TestFlight: add internal testers and run the device checklist.
5. Submit for review with the review notes from `docs/store/app-store.md`.

## App Review considerations

- **Guideline 4.2 (minimum functionality).** Pandaro is more than a website wrapper:
  - it ships its full app offline in the bundle, with no remote web content;
  - it uses native local notifications, haptics, keep-awake, the share sheet and app lifecycle
    handling to restore sessions;
  - it includes the animated panda, statistics and the garden.
- **Guideline 5.1 (privacy).** No data collection, no account, and the privacy manifest is
  included.
- **Background execution.** Pandaro does not claim to run in the background; the notification is
  scheduled locally.

## Known limitations

- No iOS build has been compiled or run yet. Expect to fix any signing or team settings in Xcode.
- iOS screenshots for the store must be captured from a simulator or device at the required sizes
  (6.9" iPhone and 13" iPad). The web screenshots in `docs/store/screenshots` are not substitutes.
