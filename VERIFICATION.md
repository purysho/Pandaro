# Verification matrix: Pandaro 1.0.0

Recorded 2026-10-26 in a Linux cloud container (no KVM, no macOS). "Evidence" names the command or
test that actually ran. Nothing is marked complete unless it ran and passed here.

**Status key**

- **VERIFIED**: implemented, and an automated check or direct inspection passed in this
  environment.
- **IMPLEMENTED, NOT VERIFIED**: code is present, but it can only be verified on a device,
  another browser, or a second deployment.
- **BLOCKED**: needs something outside this environment (accounts, signing keys, macOS).

## Summary of checks run

| Check                                   | Command                                                                                                              | Result                                                                                                                         |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Format                                  | `npm run format:check`                                                                                               | Pass                                                                                                                           |
| Lint                                    | `npm run lint` (`--max-warnings=0`)                                                                                  | Pass                                                                                                                           |
| Types                                   | `npm run typecheck` (strict)                                                                                         | Pass                                                                                                                           |
| Unit and integration                    | `npm run test:coverage`                                                                                              | **234 passed**, 13 files, 5 time-zone projects. Coverage: 94.1% lines, 92.9% statements; domain ≥ 97% lines, persistence ≥ 93% |
| Production build                        | `npm run build`                                                                                                      | Pass. Main JS 125 kB gzip; `dist/` 1.1 MB; 49 precached entries (750 KiB)                                                      |
| End-to-end                              | `npm run test:e2e`                                                                                                   | **22 passed** (desktop 1280×800 and Pixel 7)                                                                                   |
| End-to-end against the Docker container | `PANDARO_E2E_URL=http://localhost:8080 npx playwright test`                                                          | **22 passed** with server CSP headers                                                                                          |
| Full pipeline                           | `npm run verify`                                                                                                     | Exit 0                                                                                                                         |
| Dependency audit                        | `npm audit`                                                                                                          | 0 vulnerabilities, including dev dependencies                                                                                  |
| Docker                                  | `docker build` and `docker compose up -d --no-build`                                                                 | Container healthy, non-root (uid 101), read-only root filesystem, `/healthz` → `ok`, image 83 MB                               |
| Android                                 | `./gradlew clean lintRelease assembleDebug bundleRelease`                                                            | Build successful; release lint: "No issues found"                                                                              |
| Android signing pipeline                | Throwaway keystore via `keystore.properties`, then `jarsigner -verify` and `apksigner verify`                        | "jar verified"; certificate printed. Key deleted, never committed                                                              |
| iOS static checks                       | plistlib parse of Info.plist and PrivacyInfo.xcprivacy; `xcode` package parse of `project.pbxproj`; `npx cap doctor` | Plists valid, App target present; doctor: Android OK, "Xcode is not installed"                                                 |
| Store text limits                       | `node docs/store/check-lengths.mjs`                                                                                  | All within limits                                                                                                              |
| CI on GitHub                            | REST API check of the Actions run for the first push                                                                 | `CI` workflow **success** (web and docker jobs)                                                                                |

## Release artifacts (this environment)

| File                                             | Size   | SHA-256                                                            |
| ------------------------------------------------ | ------ | ------------------------------------------------------------------ |
| `pandaro-1.0.0-web.tar.gz` (contents of `dist/`) | 632 kB | `eefd4f496fe1cc1d73b7b150072db23711df1a998750b6df78e6d09048a18d56` |
| `pandaro-1.0.0-debug.apk`                        | 4.9 MB | `78f78d6dd2f2ba713ab73d37824d378a496b8c37a4f404564fde8aefcba7f0b5` |
| `pandaro-1.0.0-release-unsigned.aab`             | 2.3 MB | `4975f598242553d94da336bfb2412b2b6c8d569bc05a20d815ffad8427c1d72a` |

Binaries are not committed. CI rebuilds them as workflow artifacts (`pandaro-web-dist`,
`pandaro-android`).

## Requirements

### Timer (brief §3)

| Requirement                                                                                 | Status         | Evidence                                                                                                                                               |
| ------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Start, pause, resume, reset, skip, switch type, auto-progression toggle                     | VERIFIED       | `timer-machine.test.ts`, `ui.test.tsx` (controls, switch confirmation), E2E keyboard test                                                              |
| MM:SS display, session type, progress, active task, next session                            | VERIFIED       | `ui.test.tsx` (timer text, dots, "Next: Short break · 5 min"), screenshots                                                                             |
| Circular ring fills clockwise from empty, accurate, colour per session type, reduced motion | VERIFIED       | `ProgressRing` derives the arc from progress each render; screenshots (focus green, break clay); reduced-motion CSS                                    |
| Timestamp-driven, no decrement, accurate when throttled                                     | VERIFIED       | `remainingAt = deadline − now`; unit tests; E2E fake-clock cycle                                                                                       |
| Recovers after refresh                                                                      | VERIFIED       | E2E "refresh mid-session keeps the remaining time" (±1 s)                                                                                              |
| Sleep, suspension, long periods away                                                        | VERIFIED (web) | Unit "restoring … days later completes once", engine test, E2E away restore                                                                            |
| Clock and timezone changes                                                                  | VERIFIED       | Backward jump repair (unit, store and ClockWatch tests); epoch maths makes timezone changes harmless. Forward jumps are trusted by design (documented) |
| No duplicate completions or rewards; never negative                                         | VERIFIED       | Deterministic ids plus IndexedDB `add`; two-tab test; `remainingAt` clamps at 0                                                                        |
| Explicit state machine                                                                      | VERIFIED       | `src/domain/timer/machine.ts`, documented in ARCHITECTURE.md                                                                                           |

### Automatic progression and dots (§4)

| Requirement                                       | Status   | Evidence                                                                 |
| ------------------------------------------------- | -------- | ------------------------------------------------------------------------ |
| F→S ×3, F→L, repeat; configurable cycle length    | VERIFIED | Unit "goes F S F S F S F L", cycle length 2 test; E2E four-session cycle |
| Independent auto-start for focus and breaks       | VERIFIED | Unit auto-start tests; settings toggles test                             |
| Skip and reset grant no credit; switching handled | VERIFIED | Unit and store tests                                                     |
| Dots synchronised and reset after a cycle         | VERIFIED | E2E checks "1 of 4" … "4 of 4" → "0 of 4"                                |

### Panda (§5)

| Requirement                                                                               | Status                | Evidence                                                                      |
| ----------------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------- |
| Original SVG panda with idle, focus, break, completed, cycle and paused poses; dark theme | VERIFIED              | `Panda.tsx`; component test renders all 8 poses; visual review in both themes |
| Lightweight animation, paused when hidden or reduced                                      | VERIFIED (inspection) | CSS transforms only; `data-hidden` and reduced-motion rules                   |
| Tap interaction with encouragement, rate-limited                                          | VERIFIED              | `ui.test.tsx` "pats the panda"                                                |
| Panda Garden (optional), no streaks or purchases                                          | VERIFIED              | `tasks-garden.test.ts`, UI test, screenshot                                   |

### Audio (§6)

| Requirement                                                               | Status                    | Evidence                                              |
| ------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------- |
| Original three-note Web Audio chime, toggle, volume, distinct break chime | VERIFIED (logic)          | `platform.test.ts` with a mocked AudioContext         |
| Gesture unlock, suspended context, no sound when muted, no duplicates     | VERIFIED                  | Chime tests; store test (no chime when away or muted) |
| Actually audible on real speakers                                         | IMPLEMENTED, NOT VERIFIED | Needs a human ear                                     |

### Tasks (§7)

| Requirement                                                                                                                                                      | Status   | Evidence                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------ |
| Add, edit, active, deselect, complete, reopen, delete, clear completed with undo, reorder, filters, notes, estimates, session counts, Enter to add, empty states | VERIFIED | `stores.test.ts`, `ui.test.tsx`, `tasks-garden.test.ts`, E2E persistence |

### Statistics (§8)

| Requirement                                                                     | Status   | Evidence                                                     |
| ------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------ |
| Today strip resets by local date; history kept                                  | VERIFIED | `stats.tz.test.ts` ("keeps history after the date changes")  |
| Daily, weekly, monthly, completed tasks, activity, recent, longest, consistency | VERIFIED | Metric tests; UI stats test; screenshots                     |
| Completed, interrupted and skipped distinguished; planned vs actual             | VERIFIED | `focusOutcomes` test; recent rows use shape plus text        |
| Midnight, DST, timezone handling                                                | VERIFIED | Five time-zone projects, including Lord Howe's 30-minute DST |
| Derived from records, no counters                                               | VERIFIED | `metrics.ts` design                                          |

### Themes and UX (§9–10)

| Requirement                                                                         | Status               | Evidence                                                                                     |
| ----------------------------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------- |
| Light, dark and system; persisted; no flash                                         | VERIFIED             | E2E "theme choice persists without a flash"; `theme-init.js`                                 |
| Token system; WCAG contrast                                                         | VERIFIED             | `tokens.test.ts` (36 pairs); axe scans with no serious or critical issues                    |
| Responsive: phone, tablet, desktop, landscape                                       | VERIFIED (visual)    | Screenshots at 412×824, 820×1180, 1280×800 and 844×390 (landscape layout fixed after review) |
| Keyboard, focus rings, labels, screen readers, reduced motion, touch targets        | VERIFIED (automated) | axe in both themes; keyboard E2E; 44 px controls. Real screen reader not tested              |
| Onboarding, shortcuts, presets, focus mode, keep awake, export/import, clear errors | VERIFIED             | UI tests (onboarding, shortcuts, presets, import error)                                      |

### Notifications and background (§11)

| Requirement                                                                                                    | Status                    | Evidence                                                            |
| -------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------- |
| Web notification when a session ends in a hidden tab; contextual permission request; works when denied         | VERIFIED (logic)          | `platform.test.ts`, notification prompt UI test                     |
| Native: schedule at the deadline, cancel on pause, reset or skip, no duplicates, reschedule, tap opens the app | VERIFIED (mocked plugin)  | `native.test.ts`                                                    |
| Native delivery on real Android and iOS                                                                        | IMPLEMENTED, NOT VERIFIED | Needs a device. Checklists in ANDROID_RELEASE.md and IOS_RELEASE.md |
| No promise of background execution; limitations documented                                                     | VERIFIED                  | ARCHITECTURE.md, README, settings text                              |

### Persistence (§12)

| Requirement                                                                                  | Status   | Evidence                                          |
| -------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------- |
| Local-first, offline, versioned schema, migrations, validation, quarantine, failure handling | VERIFIED | `persistence.test.ts`, `engine.test.ts`           |
| Export and import: validation, warnings, merge and replace, undo                             | VERIFIED | Persistence and store tests; UI import error test |
| Clear all data                                                                               | VERIFIED | Store test plus UI DELETE confirmation test       |

### PWA (§13)

| Requirement                                               | Status                    | Evidence                                                                      |
| --------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------- |
| Manifest, icons, maskable, offline, service worker, scope | VERIFIED                  | E2E manifest and offline tests; sub-path build smoke test (scope `/pandaro/`) |
| Safe update handling                                      | IMPLEMENTED, NOT VERIFIED | Prompt mode, `no-cache` headers verified; banner needs two deployments        |
| Install guidance                                          | VERIFIED (code)           | Install button or hint in Settings → About                                    |

### Android (§14)

| Requirement                                                                          | Status                                     | Evidence                                             |
| ------------------------------------------------------------------------------------ | ------------------------------------------ | ---------------------------------------------------- |
| Project, app ID, icons, adaptive icon, splash, API 36, R8, minimal permissions, lint | VERIFIED                                   | Gradle build, aapt2 badging, lint "No issues found"  |
| Back button, lifecycle, safe areas                                                   | VERIFIED (mocked) / NOT VERIFIED on device | `native.test.ts`; Capacitor SystemBars CSS variables |
| Signing pipeline                                                                     | VERIFIED                                   | Throwaway key signs and verifies                     |
| Signed release with your key; Play submission                                        | BLOCKED                                    | Needs your upload key and a Play Console account     |
| Runtime on an emulator or device                                                     | BLOCKED                                    | No KVM in this environment                           |

### iOS (§15)

| Requirement                                                                           | Status            | Evidence                                             |
| ------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------- |
| Project, bundle ID, icons, launch screen, privacy manifest, export compliance, iOS 15 | VERIFIED (static) | Plist and pbxproj parsing                            |
| Build, simulator, device, TestFlight, App Store                                       | BLOCKED           | Needs macOS, Xcode 26 and an Apple Developer account |

### Self-hosting (§16)

| Requirement                                                                        | Status                        | Evidence                                                                                                                         |
| ---------------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Dockerfile, Compose, health check, restart policy, caching headers, non-root, docs | VERIFIED                      | Container healthy; header checks; E2E against the container                                                                      |
| `docker compose up -d --build` exactly as documented                               | VERIFIED in CI / adapted here | The sandbox needed `--secret id=ca` and a mirror for base images (Docker Hub rate limit). The CI docker job runs the plain build |

### Security and privacy (§17)

| Requirement                                      | Status            | Evidence                                                      |
| ------------------------------------------------ | ----------------- | ------------------------------------------------------------- |
| No accounts, ads, analytics or external requests | VERIFIED          | E2E asserts zero non-local requests; CSP `default-src 'self'` |
| CSP and security headers                         | VERIFIED          | Meta CSP in the build; nginx headers on every route           |
| No unsafe HTML                                   | VERIFIED          | Lint rule bans `dangerouslySetInnerHTML`                      |
| Import validation and fuzzing                    | VERIFIED          | 300-case malformed corpus test                                |
| Dependency scanning                              | VERIFIED          | `npm audit` 0; CI gate on runtime dependencies                |
| Accurate privacy policy                          | VERIFIED (review) | PRIVACY.md matches the permissions and code                   |

### Assets, docs, CI (§19–22)

| Requirement                                                        | Status                       | Evidence                                                                                                                                            |
| ------------------------------------------------------------------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Original logo, mascot, icons, splash, social card, feature graphic | VERIFIED                     | `scripts/generate-assets.mjs`; vector sources in `assets/`                                                                                          |
| Licences verified                                                  | VERIFIED                     | Fonts OFL-1.1; `THIRD_PARTY_NOTICES.md` plus in-app licence list                                                                                    |
| All required documents                                             | VERIFIED                     | README, ARCHITECTURE, DEVELOPMENT, TESTING, DEPLOYMENT, ANDROID_RELEASE, IOS_RELEASE, PRIVACY, CHANGELOG, WORK_LOG, RELEASE_CHECKLIST, VERIFICATION |
| Store material                                                     | VERIFIED (text and graphics) | `docs/store/*`; limits checked; screenshots 2:1                                                                                                     |
| iOS store screenshots                                              | BLOCKED                      | Needs a simulator                                                                                                                                   |
| CI                                                                 | VERIFIED                     | CI workflow green on GitHub. Android workflow added; its result is recorded in WORK_LOG after the push                                              |

## Known limitations

- Browsers cannot notify after the tab is closed; native notifications may be delayed without
  exact-alarm access on Android.
- End-to-end tests run on Chromium only.
- No crash reporting, by design.
