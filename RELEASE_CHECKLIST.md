# Release checklist

Run through this for every release. Items marked (✓ 1.0.0) were done for the 1.0.0 release in
the build environment; unmarked items need you.

## 1. Prepare

- [ ] Update `version` in `package.json` (Android `versionName`/`versionCode` follow automatically)
- [ ] Update `MARKETING_VERSION` and increment `CURRENT_PROJECT_VERSION` in Xcode
- [ ] Add a `CHANGELOG.md` entry (✓ 1.0.0)
- [ ] `npm run notices` if dependencies changed (✓ 1.0.0)
- [ ] `npm audit` reports no high or critical issues (✓ 1.0.0: 0 vulnerabilities)

## 2. Verify

- [ ] `npm run verify` passes: format, lint, types, unit and integration with coverage, build, end-to-end (✓ 1.0.0)
- [ ] Docker: `docker compose up -d --build`, `/healthz` returns `ok`, `PANDARO_E2E_URL=http://localhost:8080 npx playwright test` passes (✓ 1.0.0)
- [ ] Manual browser check in Safari and Firefox (one full session, notifications, install)
- [ ] `npm run android:build` succeeds with release lint clean (✓ 1.0.0, unsigned)
- [ ] Android device checklist in [ANDROID_RELEASE.md](ANDROID_RELEASE.md)
- [ ] iOS build and device checklist in [IOS_RELEASE.md](IOS_RELEASE.md)

## 3. Publish

- [ ] Tag the release: `git tag -a vX.Y.Z -m "Pandaro X.Y.Z" && git push --tags` (✓ 1.0.0)
- [ ] Web: deploy `dist/` or the Docker image ([DEPLOYMENT.md](DEPLOYMENT.md))
- [ ] Privacy policy published at a public URL (required by both stores)
- [ ] Android: sign the AAB with the upload key, upload to Internal testing, then promote ([docs/store/google-play.md](docs/store/google-play.md))
- [ ] iOS: archive, upload, TestFlight, submit ([docs/store/app-store.md](docs/store/app-store.md))

## 4. After release

- [ ] Smoke-test the production web deployment (load, start a session, offline reload)
- [ ] Confirm the update banner appears for users of the previous version
- [ ] Watch store review feedback and crash reports in Play Console / App Store Connect (no in-app crash reporting by design)
