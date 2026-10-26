# Pandaro work log

Each entry records what was done, the files touched, the checks that actually ran, and their results.
"NOT VERIFIED" means the check could not be run in this environment.

## Environment (recorded 2026-10-26)

| Item          | Value                                                                                                                                        |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| OS            | Linux x86_64 (cloud container), 4 CPU, 15 GB RAM                                                                                             |
| Node / npm    | 22.22.0 / 10.9.4                                                                                                                             |
| Java          | OpenJDK 21.0.12                                                                                                                              |
| Docker        | 29.9.2 (daemon started manually; Docker Hub anonymous pulls rate-limited, so local builds used the AWS ECR Public mirror of the same images) |
| KVM           | Not available (`/dev/kvm` missing), so no Android emulator                                                                                   |
| macOS / Xcode | Not available                                                                                                                                |
| Outbound TLS  | Intercepted by a sandbox proxy; container builds need the proxy CA (`--secret id=ca`)                                                        |

---

## 1. Phase 0: research and compatibility (2026-10-26)

- **Done:** checked the latest stable versions with `npm view` and their peer ranges. Read official docs with curl (Firecrawl was out of credits).
- **Decisions:**
  - TypeScript 6.0.3 rather than 7.0. `typescript-eslint` 8.72 requires TypeScript `<6.1`.
  - ESLint 9.39 rather than 10. `eslint-plugin-jsx-a11y` 6.10 supports ESLint ≤ 9.
  - Playwright pinned to 1.63.0, the browser preinstalled in this environment. `playwright-core` is overridden so `@axe-core/playwright` uses the same version.
  - Removed `@capacitor/assets` and `@vite-pwa/assets-generator`. They pulled in an old Capacitor CLI and a vulnerable `sharp`. Replaced with `scripts/generate-assets.mjs` on `sharp` 0.35.5.
  - npm overrides for `tar` 7.5.22 and `uuid` 11.1.1 fix the advisories coming from Capacitor CLI dependencies. `npm audit` now reports 0 vulnerabilities, including dev dependencies.
  - Google Play requires API 36 for new apps and updates submitted from 31 Aug 2026. Source: developer.android.com/google/play/requirements/target-sdk. Android will use compile/target SDK 36 and minSdk 24, the Capacitor 8 defaults.
  - Capacitor 8 requires Node 22+, Xcode 26 and iOS 15. New iOS projects use Swift Package Manager by default.
  - Exact alarms need the user-granted `SCHEDULE_EXACT_ALARM` permission. The default is inexact delivery with no exact-alarm permission, and the possible delay is documented.
- **Result:** dependency set installed; `npm audit` reports 0 vulnerabilities.

## 2. Phases 1–2: foundation and core (2026-10-26)

- **Done:**
  - Configured strict TypeScript, ESLint (typescript-eslint strict, react-hooks, jsx-a11y, and a domain import boundary), Prettier, Tailwind 4 tokens, Vitest projects (jsdom plus 4 timezone projects), Playwright, CI workflow and MIT licence.
  - Built a pure timestamp-driven timer state machine (`src/domain/timer`) with deterministic session ids, an "away" policy and backward-clock repair.
  - Wrote stats allocation that is safe across midnight and DST, plus task rules and garden derivation.
  - Persistence: an IndexedDB repository with quarantine of malformed rows, an in-memory fallback, zod schemas, field-wise settings migration and validated backup import/export.
  - Platform adapters: Web Audio chime, web and native notifications, wake lock, haptics, status bar and lifecycle.
  - Zustand stores and the engine (tick loop, cross-tab sync, lifecycle).
  - UI: timer ring, dots, controls, original SVG panda with 8 poses, tasks, stats charts, garden, settings, onboarding, shortcuts and toasts.
- **Checks run:**
  - `npx vitest run`: **219 passed**, across 5 timezones (Europe/London, UTC, America/New_York, Australia/Lord_Howe, Asia/Kolkata).
  - `npx vitest run --coverage`: domain lines 97–99%, persistence 93–100%. Thresholds pass.
  - `npx tsc -b`, `npx eslint . --max-warnings=0` and `npx prettier --check .`: pass.
  - `npm run build`: pass. Main bundle 410 kB (125 kB gzip); service worker precaches 48 entries.
  - `npx playwright test`: **22 passed** (desktop + Pixel 7). Covers a four-session cycle with a fake clock, refresh recovery, away restore, persistence, keyboard use, theme persistence, manifest, offline reload and axe scans in light and dark.
- **Defects found and fixed:**
  1. `transform-box: fill-box` on every panda shape moved the pivots of SVG `rotate()` attributes and distorted the face. Fixed by scoping it to the animated groups only.
  2. Panda black patches were invisible in dark mode. Fixed with an edge stroke drawn only in the dark theme.
  3. `Modal` re-ran its focus effect on every render because `onClose` was inline, so focus jumped away from inputs while typing. Fixed with a ref. A component test covers it.
  4. Nested dialogs: Escape closed both. Now only the topmost dialog handles keys. Tested.
  5. Rendering both desktop and mobile layouts at once duplicated the timer in the DOM. Replaced with a media-query hook.
  6. The axe contrast check was flaky because it measured mid fade-in. The test now waits for finite animations.
  7. The test for the 7-day window had a wrong expectation (the code was correct).
- **Next:** Docker, documentation, first push.

## 3. Phase 5 (early): Docker deployment (2026-10-26)

- **Done:**
  - Multi-stage `Dockerfile` (node build stage, then unprivileged nginx), `docker/nginx.conf` and shared `docker/security-headers.conf`.
  - `compose.yaml` with a read-only root filesystem, dropped capabilities, healthcheck and `restart: unless-stopped`.
  - `.env.example` and `.dockerignore`.
- **Checks run:**
  - `docker build` with the proxy CA secret and mirror base images: pass.
  - `docker compose up -d --no-build`: container `healthy`, user 101, read-only, restart policy `unless-stopped`.
  - Header check on `/`, `/index.html`, `/sw.js`, the manifest, icons and a deep link: every route sends CSP, nosniff, Referrer-Policy, Permissions-Policy, COOP and X-Frame-Options. Hashed assets are `immutable` for a year; `sw.js`, `index.html` and the manifest are `no-cache`. Gzip is on and the SPA fallback returns 200.
  - `PANDARO_E2E_URL=http://localhost:8080 npx playwright test`: **22 passed** against the container, with the strict CSP header and no console errors.
- **Defects found and fixed:**
  1. `listen [::]:8080` made nginx exit on hosts without IPv6. Now IPv4 by default, with IPv6 documented as an option.
  2. `add_header` in a location dropped the server-level headers on `/`. Fixed with a shared include.
  3. Base images are now build arguments, and an optional CA secret supports TLS-intercepting proxies.
- **Limitation:** `docker compose up -d --build` exactly as documented could not run here, because the sandbox requires the CA secret and a mirror. The image built from the same Dockerfile, and CI runs the plain build.
