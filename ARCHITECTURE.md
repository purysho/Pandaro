# Architecture

Pandaro is one React and TypeScript code base, shipped as a static web app (PWA and Docker) and
wrapped by Capacitor for Android and iOS. There is no backend.

```
 ┌──────────────────────────── src/ui (React) ────────────────────────────┐
 │ screens: Timer · Tasks · Stats · Garden · Settings · Onboarding         │
 │ components: Panda, ProgressRing, SessionDots, Modal, Toasts, charts     │
 └───────────────▲─────────────────────────────────────────▲──────────────┘
                 │ selectors / actions                      │
 ┌───────────────┴──────── src/state (Zustand stores) ──────┴──────────────┐
 │ timerStore · taskStore · historyStore · settingsStore · uiStore         │
 │ engine.ts (start-up, tick loop, lifecycle, cross-tab sync)              │
 └──────▲──────────────────────▲───────────────────────────▲──────────────┘
        │ pure functions        │ repository                 │ ports
 ┌──────┴───── src/domain ──────┐ ┌──── src/persistence ────┐ ┌── src/platform ─────────┐
 │ timer/machine.ts             │ │ db.ts (IndexedDB)       │ │ clock, audio/chime      │
 │ stats/allocate, metrics      │ │ schema.ts (zod)         │ │ notifications web/native│
 │ tasks/rules, garden          │ │ migrations, backup      │ │ lifecycle, keep-awake,  │
 │ (no I/O, no React)           │ │ storage (localStorage)  │ │ haptics, files          │
 └──────────────────────────────┘ └─────────────────────────┘ └─────────────────────────┘
          dist/ → Web/PWA (nginx, static hosts) · Capacitor Android · Capacitor iOS
```

An ESLint rule enforces that `src/domain` imports nothing from state, persistence, platform, UI
or React.

## Technology choices

| Concern    | Choice                                     | Why                                                                                                                             |
| ---------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| UI         | React 19 + TypeScript 6.0 (strict)         | TypeScript 7 is out, but `typescript-eslint` does not yet support it.                                                           |
| Build      | Vite 8                                     | Fast builds and a first-class PWA plugin.                                                                                       |
| Styling    | Tailwind CSS 4 + CSS custom properties     | Every colour is a token in `src/ui/styles/app.css`, redefined for dark mode.                                                    |
| State      | Zustand 5                                  | Small, and stores can be used outside React (engine, tests).                                                                    |
| Storage    | IndexedDB (`idb`) and localStorage         | IndexedDB holds the history and tasks. localStorage holds settings and the timer snapshot, which must be written synchronously. |
| Validation | zod 4                                      | Validates stored rows, backups and migrations.                                                                                  |
| PWA        | vite-plugin-pwa (Workbox) in `prompt` mode | Updates wait until the user chooses to reload.                                                                                  |
| Native     | Capacitor 8                                | Shares the web code, with real native notifications, haptics, keep-awake, share sheet and lifecycle.                            |
| Charts     | Hand-written SVG                           | No chart dependency; themed and accessible.                                                                                     |
| Fonts      | Fontsource (bundled)                       | No requests to font CDNs; works offline.                                                                                        |

## Timer state machine

`src/domain/timer/machine.ts` is a set of pure functions `(state, config, now) → { state, effects }`.

- **States:** `idle` → `running` ⇄ `paused`. Completion is a transition from `running` that
  produces the next session as `idle`, or as `running` when auto-start applies.
- **No decrementing.** While running, the state stores a wall-clock `deadline`. Remaining time is
  `max(0, deadline − now)`. A tick only observes the clock, so throttled or skipped ticks cannot
  cause drift.
- **Segments.** Each run interval (`start`, `end`) is recorded. Pauses close a segment. Actual
  focus time is the sum of the segments, which is how midnight-spanning sessions are split.
- **Deterministic ids.** Session ids are `<installPrefix>-<seq>`. Two tabs that complete the same
  session produce the same record id and the same next state.
- **Exactly-once completion.** The session record is written with IndexedDB `add` (keyed by id).
  Only the writer whose `add` succeeds plays the chime, credits the task, grows the garden and
  shows the celebration.
- **Away policy.** A completion observed more than 90 s after its deadline counts as "away":
  - It is credited only up to the deadline.
  - The next session is never auto-started.
  - A notice says when it ended.
  - Pandaro never chains several sessions while the app was not running.

  The 90 s margin covers background tabs that run timers only once a minute.

- **Clock changes.**
  - Timezone changes don't matter, because all timer maths uses epoch milliseconds.
  - A backward wall-clock jump is detected two ways: while the page runs, by comparing
    `Date.now()` with `performance.now()`; and on restore, by comparing with the last saved
    checkpoint. The deadline is then shifted so progress is preserved.
  - Forward jumps are trusted, because they cannot be told apart from device sleep on platforms
    where the monotonic clock pauses.
- **Manual actions.**
  - Reset records an `interrupted` session.
  - Skip records `skipped`.
  - Switching session type mid-run asks for confirmation, then records `interrupted`.
  - None of these grant credit or advance the cycle dots.
  - A reset or skip that happens after the deadline completes the session instead, so earned
    sessions are never thrown away.
- **Cycle.** `completedInCycle` counts completed focus sessions. When it reaches the cycle length,
  the next break is long; the dots reset when the long break ends or a new focus session starts.

### Persistence of the running timer

The full timer state is written synchronously to `localStorage` (`pandaro.timer.v1`) on every
transition, and on `pagehide` and `visibilitychange`. On start-up it is validated (zod); a
malformed snapshot is discarded and the app starts idle. History is unaffected. Other tabs
receive the change through the `storage` event and adopt it.

## Statistics

Statistics are derived from the session history every time; there are no counters that could
drift.

| Metric              | Definition                                                                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sessions (today)    | Completed focus sessions whose `endedAt` is on today's local date.                                                                                  |
| Focus time          | Actual running time of every focus session (completed, interrupted or skipped), split across local dates at midnight, plus the session in progress. |
| Tasks done          | Tasks whose `doneAt` is on the local date. Reopening a task clears `doneAt`.                                                                        |
| Scheduled vs actual | Planned minutes of completed focus sessions vs actual minutes of all focus sessions.                                                                |
| Consistency         | Days in the window with at least one completed focus session.                                                                                       |

Midnight splitting uses the local `Date` constructor, so 23- and 25-hour days around
daylight-saving changes are correct. These metrics are tested in five time zones, including
Lord Howe Island's half-hour DST shift.

## Data model and storage

- **IndexedDB `pandaro` (schema v1):**
  - `sessions` (key `id`, index `endedAt`)
  - `tasks` (key `id`)
  - `kv` (quarantine of damaged rows)
- **localStorage:**
  - `pandaro.settings.v1`
  - `pandaro.timer.v1`
  - `pandaro.onboarded`
  - `pandaro.notifyAsked`
- **Migrations:**
  - IndexedDB upgrades run in `onupgradeneeded`, ordered by version.
  - Settings are migrated field by field: valid fields are kept and others fall back to defaults.
- **Integrity:** rows that fail validation on load are moved to the `kv.quarantine` entry, and
  the user sees a toast. The rest of the data still loads.
- **Storage unavailable:** if IndexedDB is unavailable (some private modes), an in-memory
  repository is used and a banner explains that data will not be kept.
- **Backups:** `pandaro-backup-YYYY-MM-DD.json`, `{ format, version, exportedAt, settings, tasks, sessions }`.
  - Imports are validated, capped at 10 MB, and previewed before applying.
  - **Merge** adds what is missing (existing sessions win; the newer task wins).
  - **Replace** swaps everything, including settings.
  - Both can be undone from the toast.

## Platform adapters

| Port           | Web                                                                           | Native (Capacitor)                                                                                                                                                                       |
| -------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Notifications  | Shown when a session ends while the tab is hidden (needs the tab to be open). | One local notification scheduled at the deadline while the app is in the background; cancelled in the foreground, on pause, reset, skip or setting change. Serialised and de-duplicated. |
| Sound          | Web Audio chime, unlocked by the first Start or Play                          | Same (WebView); the notification sound covers the background                                                                                                                             |
| Keep screen on | Screen Wake Lock API                                                          | `@capacitor-community/keep-awake`                                                                                                                                                        |
| Haptics        | None                                                                          | `@capacitor/haptics`                                                                                                                                                                     |
| Back button    | n/a                                                                           | Closes the sheet, then returns to the timer, then minimises (never exits mid-session)                                                                                                    |
| Export         | Download link                                                                 | Filesystem (cache) + share sheet                                                                                                                                                         |
| Safe areas     | `env(safe-area-inset-*)`                                                      | Capacitor `SystemBars` CSS variables (Android edge-to-edge), `env()` on iOS                                                                                                              |

## Notifications and background behaviour

- **Browsers** cannot run Pandaro's timer or show a notification after the tab is closed.
  Background tabs keep running at a reduced rate, and the timestamp maths keeps the countdown
  correct.
- **Native apps** don't run in the background either. The single scheduled local notification is
  the only background signal. When the app returns, the restore policy completes the session.
- **Android exact timing:**
  - Pandaro declares the user-granted `SCHEDULE_EXACT_ALARM` (via the notifications plugin) and
    never asks for it.
  - On Android 12, or when the user allows "Alarms & reminders", notifications are exact.
    Otherwise they are inexact and may be delayed by battery saving.
  - `USE_EXACT_ALARM` is not used.

## Design system

Tokens live in `src/ui/styles/app.css`:

- **Colours:** paper, surface, ink and muted, with a separate accent for each session (forest
  for focus, clay for short breaks, dusk blue for long breaks).
- **Dark mode:** the same tokens are redefined.
- **Contrast:** `tests/unit/tokens.test.ts` checks WCAG contrast for every essential pair in both
  themes.
- **Fonts:** Zen Maru Gothic for display and Atkinson Hyperlegible Next for body text, with
  tabular numerals for the timer.
- **Motion:** transforms and opacity only. It pauses when the page is hidden and is disabled by
  "Reduce animation" or `prefers-reduced-motion`.

## Directory layout

```
src/
  app/          App shell, PWA registration
  domain/       Pure logic: timer, stats, tasks, garden
  state/        Zustand stores, engine, data operations
  persistence/  IndexedDB, localStorage, schemas, migrations, backups
  platform/     Browser and Capacitor adapters
  ui/           Components, screens, panda, hooks, styles
tests/          unit/, integration/, e2e/ (Playwright)
scripts/        Asset generation and screenshots
assets/         Vector sources for icons, splash and store graphics
docker/         nginx configuration and security headers
android/ ios/   Capacitor native projects
docs/store/     Store listings and screenshots
```
