# Testing

## Layers

| Layer             | Tool                                                | Location                                                   | Covers                                                                                                                                                                                                                      |
| ----------------- | --------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain unit tests | Vitest                                              | `tests/unit/timer-machine.test.ts`, `tasks-garden.test.ts` | Every timer transition, cycles, reset, skip, switching, away policy, clock changes, ordering, garden                                                                                                                        |
| Time-zone tests   | Vitest projects with `TZ`                           | `tests/unit/*.tz.test.ts`                                  | Midnight splitting, DST days, daily, weekly and monthly metrics in UTC, New York, Lord Howe (30-minute DST) and Kolkata                                                                                                     |
| Platform units    | Vitest                                              | `tests/unit/platform.test.ts`                              | Chime unlock, mute, volume, once per session, suspended context, no Web Audio; clock-jump detection; web notifications; formatting                                                                                          |
| Design tokens     | Vitest                                              | `tests/unit/tokens.test.ts`                                | WCAG contrast of essential colour pairs in both themes                                                                                                                                                                      |
| Persistence       | Vitest + fake-indexeddb                             | `tests/integration/persistence.test.ts`                    | Exactly-once session insert, tasks, merge and replace, quarantine of damaged rows, memory fallback, localStorage failures, migrations, backup validation with a 300-case malformed-input corpus                             |
| Stores and engine | Vitest                                              | `tests/integration/stores.test.ts`, `engine.test.ts`       | Snapshot persistence, completion side effects, two-tab duplicate prevention, undo, import/export, start-up restore, cross-tab sync, lifecycle                                                                               |
| Native adapters   | Vitest with mocked Capacitor plugins                | `tests/integration/native.test.ts`                         | Notification scheduling and cancelling (background only, de-duplicated), permissions, back button, keep-awake, share                                                                                                        |
| Components        | Testing Library                                     | `tests/integration/ui.test.tsx`                            | Controls, confirmation dialogs, shortcuts, tasks, settings, onboarding, stats, garden, notification prompt, all panda poses                                                                                                 |
| End-to-end        | Playwright (Chromium, desktop 1280×800 and Pixel 7) | `tests/e2e/app.spec.ts`                                    | Clean load with zero external requests, full 4-session cycle on a fake clock, refresh recovery, away restore, persistence, keyboard use, theme persistence, manifest, offline reload, axe accessibility scan in both themes |

## Running

```bash
npm test                 # all Vitest projects
npm run test:coverage    # with coverage thresholds (domain ≥ 90 % lines, persistence ≥ 90 %)
npm run build && npm run test:e2e
PANDARO_E2E_URL=http://localhost:8080 npx playwright test   # against a running deployment
```

Playwright is pinned to 1.63. Run `npx playwright install chromium` once on a new machine
(CI runs `npx playwright install --with-deps chromium`).

## What is not covered automatically

| Area                                                | Status                                                                    | How to check by hand                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Android app on a device or emulator                 | Not verified here (no KVM in the build environment)                       | Follow the device checklist in [ANDROID_RELEASE.md](ANDROID_RELEASE.md) |
| iOS app                                             | Not verified here (no macOS)                                              | Follow the device checklist in [IOS_RELEASE.md](IOS_RELEASE.md)         |
| Background notification delivery on Android and iOS | Not verified (needs a device)                                             | Start a 1-minute session, lock the phone, wait                          |
| Audible chime                                       | Logic is unit-tested with a mocked AudioContext; actual sound is not      | Settings → Sound → Play                                                 |
| PWA install prompt UI                               | Manifest and service worker are tested; the browser install dialog is not | Chrome: address bar install icon                                        |
| Service-worker update prompt                        | Registration is tested; the "new version" banner needs two deployments    | Deploy, change something, deploy again, revisit                         |
| Safari / Firefox                                    | E2E runs on Chromium only                                                 | Open the app and run through a session                                  |

The complete requirement-by-requirement record is in [VERIFICATION.md](VERIFICATION.md).
