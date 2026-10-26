#!/usr/bin/env node
// Checks store text against platform character limits. Exits non-zero if any is too long.
const fields = [
  ['Play app name', 'Pandaro: Calm Pomodoro Timer', 30],
  [
    'Play short description',
    'A calm panda Pomodoro timer with tasks and stats. Private, offline, no account.',
    80,
  ],
  ['App Store name', 'Pandaro: Calm Pomodoro Timer', 30],
  ['App Store subtitle', 'Focus sessions with a panda', 30],
  [
    'App Store promotional text',
    'Focus for 25 minutes, rest for 5, and let a calm panda keep you company. Private, offline and free, with tasks, statistics and a growing bamboo garden.',
    170,
  ],
  [
    'App Store keywords',
    'pomodoro,focus,timer,study,productivity,tasks,concentration,work,break,habit,calm,time management',
    100,
  ],
];

import { readFileSync } from 'node:fs';
const play = readFileSync(new URL('./google-play.md', import.meta.url), 'utf8');
const full =
  play.split('**Full description** (max 4000):')[1]?.split('```text')[1]?.split('```')[0]?.trim() ??
  '';
fields.push(['Full description', full, 4000]);

let failed = false;
for (const [name, text, max] of fields) {
  const ok = text.length > 0 && text.length <= max;
  failed ||= !ok;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${text.length}/${max}`);
}
process.exit(failed ? 1 : 0);
