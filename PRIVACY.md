# Pandaro privacy policy

_Last updated: 26 October 2026. Applies to Pandaro 1.0.0 on the web, as an installed web app, and
on Android and iOS._

## Summary

Pandaro does not collect, transmit, sell or share any personal data. Everything you enter stays
on your device.

## What Pandaro stores, and where

Pandaro saves the following **only on your device**, in your browser's or the app's local
storage (IndexedDB and localStorage):

- your tasks, including titles, notes and estimates;
- your session history: start and end times, session type and outcome;
- the current timer state, so a running session survives a refresh;
- your settings, such as durations, theme and sound;
- whether you have seen the welcome screens or the notification prompt.

The developer has no access to this data. Nothing is sent to a server: Pandaro has no
account system, no backend, no analytics, no advertising, no crash reporting and no third-party
SDKs. Its Content Security Policy only allows connections to the address the app itself is served
from. The fonts are bundled with the app and are not loaded from a font service.

## Permissions

- **Notifications (optional).** Used only to tell you when a session ends. You can turn this off
  in Pandaro's settings or in your device settings.
- **Alarms and reminders (Android, optional).** Lets Android deliver session notifications on
  time. Pandaro never asks for it; Android may grant it automatically on some versions.
- **Run at start-up (Android).** Restores a scheduled session notification after the device
  restarts.
- **Vibration (Android).** Gives gentle haptic feedback.
- **Internet (Android).** Declared by Capacitor, the framework the app is built on. Pandaro does
  not use it.

Pandaro does not access your camera, microphone, location, contacts, photos or files, except a
backup file you choose to import.

## Backups and device transfers

When you choose **Export backup**, Pandaro creates a JSON file and hands it to your browser or
the system share sheet. Where it goes next is up to you.

Android's own device backup (to your Google account) may include Pandaro's local data, if you
have that enabled. That backup is managed by Google under your account, not by Pandaro.

## Deleting your data

**Settings → Your data → Delete all data** removes every task, session, setting and cached file
from the device. Uninstalling the app, or clearing the site's data in your browser, also removes
everything.

## Self-hosted copies

If you open Pandaro on a server run by someone else, that server's operator can see standard web
server logs, such as your IP address and the time of the request. They cannot see your tasks or
history, which never leave your device.

## Children

Pandaro collects no data from anyone, including children.

## Changes and contact

Changes to this policy will be published with the app's source code and noted in the changelog.
For questions, open an issue in the project's repository: <https://github.com/purysho/pandaro>.
