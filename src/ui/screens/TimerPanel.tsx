import { useEffect, useRef, useState } from 'react';
import { durationFor, nextKindAfter, progressAt, remainingAt } from '../../domain/timer/machine';
import type { SessionKind } from '../../domain/timer/types';
import { toTimerConfig, useSettings } from '../../state/settingsStore';
import { useTasks } from '../../state/taskStore';
import { KIND_LABEL, useTimer } from '../../state/timerStore';
import { useUi } from '../../state/uiStore';
import { Icon } from '../components/Icon';
import { ConfirmDialog } from '../components/Modal';
import { ProgressRing } from '../components/ProgressRing';
import { SessionDots } from '../components/SessionDots';
import { formatClock, formatTime, spokenRemaining } from '../format';
import { Panda, type PandaPose } from '../panda/Panda';
import { TodayStrip } from './TodayStrip';

const KINDS: SessionKind[] = ['focus', 'short', 'long'];

const ENCOURAGEMENT = [
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

const CELEBRATION_MS = { cycle: 2600, session: 1800, 'break-over': 1800 } as const;

function usePandaPose(): { pose: PandaPose; message: string | null; tap(): void } {
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

export function TimerPanel({ compact = false }: { compact?: boolean }) {
  const timer = useTimer((s) => s.timer);
  const now = useTimer((s) => s.now);
  const actions = useTimer.getState();
  const settings = useSettings((s) => s.settings);
  const tasks = useTasks((s) => s.tasks);
  const setView = useUi((s) => s.setView);
  const [pendingKind, setPendingKind] = useState<SessionKind | null>(null);
  const panda = usePandaPose();

  const remaining = remainingAt(timer, now);
  const progress = progressAt(timer, now);
  const config = toTimerConfig(settings);
  const activeTask = tasks.find((t) => t.id === timer.taskId) ?? null;
  const running = timer.status === 'running';
  const nextKind = nextKindAfter(
    timer.kind,
    'completed',
    timer.kind === 'focus' ? timer.completedInCycle + 1 : timer.completedInCycle,
    config,
  );
  const nextMinutes = Math.round(durationFor(nextKind, config) / 60_000);
  const spokenMinute = Math.ceil(remaining / 60_000);

  useEffect(() => {
    document.title = running
      ? `${formatClock(remaining)} · ${KIND_LABEL[timer.kind]} · Pandaro`
      : 'Pandaro';
  }, [running, remaining, timer.kind]);

  function chooseKind(kind: SessionKind) {
    if (kind === timer.kind && timer.status === 'idle') return;
    if (timer.status !== 'idle') setPendingKind(kind);
    else actions.switchKind(kind);
  }

  return (
    <section
      aria-label="Timer"
      data-kind={timer.kind}
      className="timer-card card flex flex-col items-center gap-4 px-5 pt-4 pb-5 sm:px-8"
    >
      <div
        role="tablist"
        aria-label="Session type"
        className="timer-tabs flex w-full max-w-sm rounded-full bg-surface-2 p-1"
      >
        {KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            role="tab"
            aria-selected={timer.kind === kind}
            data-kind={kind}
            className="chip flex-1 justify-center"
            style={timer.kind === kind ? { color: 'var(--accent)' } : undefined}
            onClick={() => chooseKind(kind)}
          >
            {KIND_LABEL[kind]}
          </button>
        ))}
      </div>

      {timer.notice && (
        <div
          role="status"
          className="timer-notice flex w-full items-center gap-3 rounded-2xl bg-accent-soft px-4 py-2 text-sm"
        >
          <Icon name="info" size={18} />
          <span className="flex-1">
            {KIND_LABEL[timer.notice.kind]} finished at {formatTime(timer.notice.finishedAt)} while
            you were away.
          </span>
          <button type="button" className="font-semibold underline" onClick={actions.dismissNotice}>
            OK
          </button>
        </div>
      )}

      <div className={`timer-ring w-full ${compact ? 'max-w-[300px]' : 'max-w-[340px]'}`}>
        <ProgressRing progress={progress}>
          <button
            type="button"
            onClick={panda.tap}
            className="relative -mt-2 w-[46%] rounded-full"
            aria-label="Pat the panda"
          >
            <Panda pose={panda.pose} />
            {panda.message && (
              <span
                role="status"
                className="bubble-in absolute -top-8 left-1/2 w-max max-w-[220px] -translate-x-1/2 rounded-2xl bg-surface-2 px-3 py-1.5 text-sm font-semibold text-ink shadow-sm"
              >
                {panda.message}
              </span>
            )}
          </button>
          <div
            role="timer"
            aria-live="off"
            aria-label={`${KIND_LABEL[timer.kind]}, ${spokenRemaining(spokenMinute * 60_000)}`}
            className="timer-digits tabular font-display leading-none font-bold"
          >
            {formatClock(remaining)}
          </div>
          <div className="eyebrow mt-1.5" style={{ color: 'var(--accent)' }}>
            {timer.status === 'paused' ? 'Paused' : KIND_LABEL[timer.kind]}
          </div>
        </ProgressRing>
      </div>

      <div className="timer-side flex w-full flex-col items-center gap-4">
        <SessionDots
          completed={Math.min(timer.completedInCycle, settings.cycleLength)}
          total={settings.cycleLength}
          kind={timer.kind}
        />

        <div className="flex items-center gap-5">
          <button
            type="button"
            className="icon-btn border-[1.5px] border-line"
            onClick={actions.reset}
            aria-label="Reset session"
            title="Reset (R)"
          >
            <Icon name="reset" />
          </button>
          <button
            type="button"
            onClick={actions.toggle}
            className="btn btn-primary size-[4.5rem] rounded-full p-0 shadow-lg"
            aria-label={running ? 'Pause' : timer.segments.length > 0 ? 'Resume' : 'Start'}
            title={running ? 'Pause (Space)' : 'Start (Space)'}
          >
            <Icon name={running ? 'pause' : 'play'} size={30} />
          </button>
          <button
            type="button"
            className="icon-btn border-[1.5px] border-line"
            onClick={actions.skip}
            aria-label="Skip to next session"
            title="Skip (S)"
          >
            <Icon name="skip" />
          </button>
        </div>

        <div className="flex w-full flex-col items-center gap-1 text-sm text-muted">
          {activeTask ? (
            <button
              type="button"
              className="flex max-w-full items-center gap-2 rounded-full bg-accent-soft px-3 py-1.5 font-semibold text-ink"
              onClick={() => setView('tasks')}
            >
              <Icon name="target" size={16} />
              <span className="truncate">{activeTask.title}</span>
              <span className="tabular text-muted">
                {activeTask.completedPomodoros}
                {activeTask.estimate ? `/${activeTask.estimate}` : ''}
              </span>
            </button>
          ) : (
            <button
              type="button"
              className="underline-offset-2 hover:underline"
              onClick={() => setView('tasks')}
            >
              Choose a task to focus on
            </button>
          )}
          <p>
            Next: {KIND_LABEL[nextKind]} · {nextMinutes} min
            {settings.autoProgress ? '' : ' (manual)'}
          </p>
        </div>

        {!(settings.focusMode && running) && <TodayStrip />}
      </div>

      <ConfirmDialog
        open={pendingKind !== null}
        title={`Switch to ${pendingKind ? KIND_LABEL[pendingKind].toLowerCase() : ''}?`}
        message="The current session will end without credit. Time already spent is kept in your history as interrupted."
        confirmLabel="Switch"
        onCancel={() => setPendingKind(null)}
        onConfirm={() => {
          if (pendingKind) actions.switchKind(pendingKind);
          setPendingKind(null);
        }}
      />
    </section>
  );
}
