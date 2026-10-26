# App Store listing: Pandaro

Character limits are checked by `node docs/store/check-lengths.mjs`.

| Field              | Text                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------ |
| App name (max 30)  | `Pandaro: Calm Pomodoro Timer`                                                       |
| Subtitle (max 30)  | `Focus sessions with a panda`                                                        |
| Primary category   | Productivity                                                                         |
| Secondary category | Education                                                                            |
| Price              | Free, no in-app purchases                                                            |
| Age rating         | 4+ (no objectionable content, no unrestricted web access, no user-generated content) |
| Copyright          | `2026 purysho`                                                                       |

**Promotional text** (max 170):

```text
Focus for 25 minutes, rest for 5, and let a calm panda keep you company. Private, offline and free, with tasks, statistics and a growing bamboo garden.
```

**Keywords** (max 100, comma-separated, no spaces after commas):

```text
pomodoro,focus,timer,study,productivity,tasks,concentration,work,break,habit,calm,time management
```

**Description** (max 4000): use the full description from
[google-play.md](google-play.md#store-listing). It contains no Android-specific claims.

## Screenshots

Required: 6.9" iPhone display (1320×2868 or 1290×2796) and, because the app runs on iPad, 13" iPad
(2064×2752 or 2048×2732).

**Not yet captured.** They need an iOS simulator or device. Suggested scenes, matching the web
captures in `docs/store/screenshots/`:

1. Focus session running (panda reading, ring partly filled)
2. Short break (panda with tea)
3. Task list with a current focus task
4. Statistics with the 7-day chart
5. Panda Garden
6. Dark mode timer

## App privacy ("nutrition label")

**Data Not Collected.** Pandaro collects no data. Everything stays on the device, and the app
includes a privacy manifest (`PrivacyInfo.xcprivacy`) stating no tracking and no collected data.

## URLs (you must provide these)

- **Privacy policy URL:** host [PRIVACY.md](../../PRIVACY.md) publicly. Not created yet.
- **Support URL:** for example the repository's issues page or a simple support page. Not
  created yet.
- **Marketing URL:** optional.

## Review notes

```text
Pandaro is a Pomodoro focus timer. No account or login is needed and there is no server: all data stays on the device.

To try it: tap the play button to start a focus session. To see the end-of-session behaviour quickly, open Settings (gear icon), set Focus to 1 minute, and start a session. When it ends you will hear a chime and the panda celebrates. If you enable "Notify me when a session ends" and leave the app, a local notification is delivered when the session ends.

Native features used: local notifications, haptics, keep-screen-on during sessions, share sheet for exporting a backup, and app lifecycle handling to restore sessions. The app bundles all of its content and works fully offline.
```

## Export compliance

`ITSAppUsesNonExemptEncryption` is `false` in Info.plist. The app uses no encryption beyond what
the operating system provides.

## TestFlight

1. Archive in Xcode and upload ([IOS_RELEASE.md](../../IOS_RELEASE.md)).
2. Add internal testers and fill in "What to Test":
   `Run a few focus sessions with notifications on, in the foreground and background. Try tasks, stats, the garden, and export/import.`
3. Run the device checklist in IOS_RELEASE.md.

## Submission checklist

- [ ] Signed archive uploaded from Xcode 26+
- [ ] Device checklist passed (iPhone and iPad)
- [ ] Screenshots captured at the required sizes
- [ ] Privacy policy and support URLs live
- [ ] App Privacy set to Data Not Collected
- [ ] Age rating questionnaire completed (4+)
- [ ] Review notes added
- [ ] Submitted for review
