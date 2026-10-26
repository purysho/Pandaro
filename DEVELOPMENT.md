# Development

## Requirements

- Node.js 22 or later and npm 10
- For Android: JDK 21 and the Android SDK (platform 36, build-tools 36)
- For iOS: macOS with Xcode 26 or later

## Common commands

| Command                           | What it does                                                                                             |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `npm ci`                          | Install exact dependencies from the lockfile                                                             |
| `npm run dev`                     | Development server with hot reload at <http://localhost:5173> (the service worker is off in development) |
| `npm run build`                   | Type-check and build to `dist/`                                                                          |
| `npm run preview`                 | Serve `dist/` at <http://localhost:4173>                                                                 |
| `npm run lint` / `npm run format` | ESLint / Prettier                                                                                        |
| `npm run typecheck`               | TypeScript project build without emit                                                                    |
| `npm test`                        | Vitest (unit and integration)                                                                            |
| `npm run test:e2e`                | Playwright against `npm run preview`                                                                     |
| `npm run verify`                  | Everything, in CI order                                                                                  |
| `npm run assets:generate`         | Regenerate icons, splash screens and store graphics from the vector sources                              |
| `npm run screenshots`             | Capture README, store and PWA screenshots (needs `npm run preview` running)                              |
| `npm run notices`                 | Regenerate `THIRD_PARTY_NOTICES.md` and `public/third-party-notices.txt`                                 |
| `npm run cap:sync`                | Build, then copy the web app into `android/` and `ios/`                                                  |
| `npm run android:build`           | Sync, then `lintRelease assembleDebug bundleRelease`                                                     |

## Project conventions

- **Domain logic is pure.** Anything in `src/domain` takes `now` as a parameter and returns new
  state. ESLint blocks imports from React, state, persistence, platform or UI there.
- **Statistics are derived from history.** Never add a counter that can drift; compute it from
  `sessions` and `tasks`.
- **Colours come from tokens.** Add new colours to both theme blocks in `src/ui/styles/app.css`.
  Add a contrast pair to `tests/unit/tokens.test.ts` if the colour carries text.
- **No raw HTML.** `dangerouslySetInnerHTML` is forbidden by lint.
- **Native features go through `src/platform`**, with a working web fallback or a no-op.

## Adding a stored field

1. Add it to the zod schema in `src/persistence/schema.ts`.
2. For settings, add a default to `DEFAULT_SETTINGS`. Field-wise migration keeps older saved
   settings valid.
3. For IndexedDB records, bump `DB_VERSION` in `src/persistence/db.ts` and add an
   `if (oldVersion < N)` block in `upgrade`.
4. If the backup format changes, bump `BACKUP_VERSION` and keep importing older versions.
5. Add a test in `tests/integration/persistence.test.ts`.

## Release versioning

`package.json` `version` is the single source of truth:

- the web app shows it in Settings → About;
- Android derives `versionName` and `versionCode = major × 10000 + minor × 100 + patch` from it;
- iOS uses `MARKETING_VERSION` (update it in Xcode or `project.pbxproj`) and an increasing build
  number.

## Working behind a TLS-intercepting proxy

Docker builds accept the proxy's CA certificate as a BuildKit secret:

```bash
docker build --secret id=ca,src=/path/to/proxy-ca.pem -t pandaro .
```

Base images can be redirected to a mirror with
`--build-arg NODE_IMAGE=… --build-arg NGINX_IMAGE=…`.
