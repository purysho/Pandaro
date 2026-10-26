# Google Play listing: Pandaro

All text below is ready to paste. Character counts are checked by `node docs/store/check-lengths.mjs`.

## Store listing

**App name** (max 30): `Pandaro: Calm Pomodoro Timer`

**Short description** (max 80):
`A calm panda Pomodoro timer with tasks and stats. Private, offline, no account.`

**Full description** (max 4000):

```text
Stay focused. Stay panda.

Pandaro is a calm Pomodoro timer with a friendly panda who keeps you company while you work. Focus for 25 minutes, rest for 5, and after four sessions take a longer break. The panda reads while you focus, sips tea on your breaks and celebrates when you finish.

FOCUS WITHOUT FUSS
• A reliable timer that stays accurate when you switch apps or lock your phone
• Focus, short break and long break, each adjustable from 1 to 120 minutes
• Moves to the next session automatically, with optional auto-start
• Four session dots show where you are in the cycle
• A gentle three-note chime and optional notifications when a session ends

ONE THING AT A TIME
• Quick task list: add, edit, reorder, complete and reopen
• Pick one task as your current focus and Pandaro counts the sessions you spend on it
• Estimate how many sessions a task needs and see your progress
• Undo for accidental deletes

SEE YOUR PROGRESS
• Today at a glance: sessions, focus time and tasks done
• Focus minutes for the last 7 days, monthly totals and a 12-week consistency map
• Honest history: completed, interrupted and skipped sessions are shown separately

GROW A BAMBOO GARDEN
• Every completed focus session helps your bamboo grow
• Unlock a paper lantern, stepping stones, a koi pond and more
• No streaks to lose, no penalties, no purchases

CALM AND ACCESSIBLE
• Light and dark themes
• Reduced animation and focus mode
• Screen reader labels, large touch targets and readable fonts

PRIVATE BY DESIGN
• No account, no ads, no tracking, no analytics
• Works fully offline
• Your tasks and history never leave your device
• Export a backup file whenever you like, or delete everything in one tap

Pandaro is free and open source.
```

## Categorisation

| Field                                 | Value                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------ |
| App category                          | Productivity                                                                               |
| Tags (choose up to 5 in Play Console) | Time management, Productivity, Task management, Focus, Timer                               |
| Contains ads                          | No                                                                                         |
| In-app purchases                      | No                                                                                         |
| Target audience                       | 13+ (general audience). The app is suitable for all ages but is not designed for children. |

**Keywords to use naturally in the text:** pomodoro, focus timer, study timer, productivity,
tasks, panda, work timer, concentration, time management.

## Graphics

| Asset                         | Requirement                                                                   | File                                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| App icon                      | 512×512 PNG, 32-bit                                                           | `docs/store/icon-512.png`                                                                          |
| Feature graphic               | 1024×500 PNG/JPG                                                              | `docs/store/feature-graphic.png`                                                                   |
| Phone screenshots             | 2–8 per device type; 320–3840 px per side; longer side at most 2× the shorter | `docs/store/screenshots/phone-*.png` (1082×2163, at most 2:1; real app captures with example data) |
| Tablet screenshots (optional) | 7" and 10"                                                                    | `docs/store/screenshots/tablet-light.png` (820×1180 CSS px)                                        |

The screenshots were captured from the real web build with Playwright (`npm run screenshots`)
using clearly fictional example tasks. They show the same UI that ships in the Android app. You
may prefer to recapture them from a device once one is available.

Suggested order:

1. `phone-timer-light.png`
2. `phone-break-light.png`
3. `phone-tasks-dark.png`
4. `phone-stats-light.png`
5. `phone-garden-light.png`
6. `phone-timer-dark.png`

## Content rating (IARC questionnaire)

- Violence, sexuality, language, controlled substances, gambling: **No** to all.
- User interaction or sharing: **No** (no accounts, no chat, no user-generated content shared
  with others).
- Location sharing: **No**. Digital purchases: **No**.
- Expected rating: **Everyone / PEGI 3**.

## Data safety form

| Question                                                              | Answer                                                     |
| --------------------------------------------------------------------- | ---------------------------------------------------------- |
| Does your app collect or share any of the required user data types?   | **No**                                                     |
| Is all of the user data collected by your app encrypted in transit?   | Not applicable (no data collected)                         |
| Do you provide a way for users to request that their data is deleted? | Data is local only. Settings → Delete all data removes it. |

Reasoning, to keep on file:

- Tasks, history and settings are stored only on the device. Google Play does not count
  on-device processing as "collection".
- No SDKs for analytics, ads or crash reporting are included.
- The `INTERNET` permission comes from the Capacitor template. The app's Content Security Policy
  allows no external connections, and Playwright tests assert that zero external requests are
  made.

## Privacy policy

Publish [PRIVACY.md](../../PRIVACY.md) at a stable public URL (for example GitHub Pages) and enter
that URL. **No URL has been created yet.**

## Release notes (1.0.0)

```text
Welcome to Pandaro! A calm Pomodoro timer with a panda companion, tasks, statistics and a bamboo garden. Works offline, no account needed.
```

## Versioning

`versionName` follows semver from `package.json`. `versionCode` = major×10000 + minor×100 + patch,
which is always increasing (1.0.0 → 10000, 1.0.1 → 10001, 1.2.0 → 10200).

## Submission checklist

- [ ] Signed AAB built with the upload key ([ANDROID_RELEASE.md](../../ANDROID_RELEASE.md))
- [ ] Device checklist passed on at least two devices
- [ ] Privacy policy URL live
- [ ] Store listing, graphics and screenshots uploaded
- [ ] Content rating, target audience, data safety, ads and app access ("no login required") completed
- [ ] Internal testing release reviewed by testers
- [ ] Closed testing period completed if your account type requires it
- [ ] Production release with the notes above
