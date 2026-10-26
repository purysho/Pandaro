import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../../state/settingsStore';
import { useTimer } from '../../state/timerStore';
import { useUi } from '../../state/uiStore';
import { type PandaPose } from '../panda/Panda';

export const ENCOURAGEMENT = [
  'One bamboo shoot at a time.',
  'Slow and steady, like a panda.',
  'You are doing great.',
  'Small steps still count.',
  'Breathe in. Focus. Breathe out.',
  'I believe in you.',
  'Deep focus, soft heart.',
  'Tea is waiting at the next break.',
  'Just this session. That is all.',
  'Pandas nap. You can finish this.',
  'Quiet mind, steady paws.',
  'Progress, not perfection.',
  'Let the rest wait for a while.',
  'Every minute here matters.',
  'Nice and calm. Keep going.',
  'You showed up. That is the hard part.',
  'Stay focused. Stay panda.',
  'Munching through it, bite by bite.',
  'The bamboo grows while you work.',
  'One task, full attention.',
  'Rest is part of the work.',
  'You can always start again.',
  'Look how far you have come.',
  'Gentle focus beats frantic hurry.',
  'A clear desk, a clear mind.',
  'I will keep you company.',
  'Almost there? Keep the rhythm.',
  'Be kind to yourself today.',
  'Find the next small step.',
  'Ready when you are.',
];

export const CELEBRATION_MS = { cycle: 2600, session: 1800, 'break-over': 1800 } as const;

export function usePandaPose(): { pose: PandaPose; message: string | null; tap(): void } {
  const timer = useTimer((s) => s.timer);
  const now = useTimer((s) => s.now);
  const celebration = useUi((s) => s.celebration);
  const pandaPose = useSettings((s) => s.settings.pandaPose);
  const [waving, setWaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const lastTap = useRef(0);
  const index = useRef(-1);

  useEffect(() => {
    if (!waving) return;
    const t = window.setTimeout(() => {
      setWaving(false);
      setMessage(null);
    }, 2600);
    return () => window.clearTimeout(t);
  }, [waving]);

  let pose: PandaPose = 'idle';
  if (timer.status === 'running') {
    pose = timer.kind === 'focus' ? 'focus' : pandaPose === 'pose-stretch' ? 'stretch' : 'break';
  } else if (timer.status === 'paused') {
    pose = 'paused';
  }
  if (waving && timer.status !== 'running') pose = 'wave';
  if (celebration && now - celebration.at < CELEBRATION_MS[celebration.kind]) {
    pose =
      celebration.kind === 'cycle'
        ? 'cycle'
        : celebration.kind === 'session'
          ? 'celebrate'
          : 'wave';
  }

  return {
    pose,
    message,
    tap() {
      const at = Date.now();
      if (at - lastTap.current < 1500) return;
      lastTap.current = at;
      index.current = (index.current + 1) % ENCOURAGEMENT.length;
      setMessage(ENCOURAGEMENT[index.current] ?? null);
      setWaving(true);
    },
  };
}
