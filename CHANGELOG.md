# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-10-26

First release.

### Added

- Timestamp-driven Pomodoro timer: focus, short break and long break, configurable from 1 to 120
  minutes, with presets. Accurate in background tabs and after sleep, refresh and clock changes.
- Four-session cycles with a configurable length, automatic progression, independent auto-start
  for focus and breaks, and four session dots.
- Exactly-once completion across tabs. Sessions that end while the app is closed are recorded once
  and never chained.
- Original SVG panda companion with idle, focus, break, stretch, paused and celebration poses, and
  encouragement on tap.
- Task manager: quick add, notes, estimates, sessions per task, one current focus, complete and
  reopen, undo for delete and clear, drag and keyboard reordering, filters.
- Statistics: today strip, 7-day chart, monthly total, 12-week consistency map, outcome breakdown,
  longest session and recent sessions. Correct across midnight and daylight-saving changes.
- Panda Garden: bamboo grows from completed sessions, with milestone decorations and an unlockable
  break pose.
- Three-note Web Audio chime with volume and a distinct end-of-break variant.
- Notifications: web (while the tab is open) and native local notifications scheduled while the
  app is in the background.
- Light, dark and system themes with no start-up flash; reduced motion; focus mode; keep screen
  on; keyboard shortcuts; onboarding.
- Local-first storage (IndexedDB and localStorage) with validation, quarantine of damaged
  records, an in-memory fallback, and JSON export/import with merge, replace and undo.
- Installable offline PWA with update prompt.
- Docker image (unprivileged nginx, strict security headers, health check) and Compose file.
- Capacitor 8 Android (API 36) and iOS (15+) projects with icons, splash, privacy manifest and
  signing configuration.
- CI for web checks, end-to-end tests, Docker smoke test and Android builds.
