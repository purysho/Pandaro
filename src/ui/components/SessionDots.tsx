import type { SessionKind } from '../../domain/timer/types';

/**
 * One dot per focus session in the cycle: filled when completed, ringed when it is the current
 * focus session, hollow otherwise. State is conveyed by shape as well as color.
 */
export function SessionDots({
  completed,
  total,
  kind,
}: {
  completed: number;
  total: number;
  kind: SessionKind;
}) {
  const current = kind === 'focus' ? completed : -1;
  return (
    <div
      className="flex items-center gap-2.5"
      role="img"
      aria-label={`${completed} of ${total} focus sessions completed in this cycle`}
    >
      {Array.from({ length: total }, (_, i) => {
        const done = i < completed;
        const isCurrent = i === current;
        return (
          <span
            key={i}
            data-state={done ? 'done' : isCurrent ? 'current' : 'todo'}
            className="grid size-3.5 place-items-center rounded-full border-2 transition-colors"
            style={{
              borderColor: done || isCurrent ? 'var(--accent)' : 'var(--line)',
              background: done ? 'var(--accent)' : 'transparent',
            }}
          >
            {isCurrent && (
              <span className="size-1.5 rounded-full" style={{ background: 'var(--accent)' }} />
            )}
          </span>
        );
      })}
    </div>
  );
}
