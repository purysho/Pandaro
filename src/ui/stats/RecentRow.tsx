import type { SessionRecord } from '../../domain/timer/types';
import { KIND_LABEL } from '../../state/timerStore';
import { formatDuration, formatTime } from '../format';

export function RecentRow({ session }: { session: SessionRecord }) {
  const label =
    session.outcome === 'completed'
      ? 'Completed'
      : session.outcome === 'skipped'
        ? 'Skipped'
        : 'Interrupted';
  const mark = session.outcome === 'completed' ? '●' : session.outcome === 'skipped' ? '○' : '◐';
  return (
    <li className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="flex items-center gap-2">
        <span
          aria-hidden="true"
          style={{
            color:
              session.kind === 'focus'
                ? 'var(--focus)'
                : session.kind === 'short'
                  ? 'var(--short)'
                  : 'var(--long)',
          }}
        >
          {mark}
        </span>
        <span className="font-semibold">{KIND_LABEL[session.kind]}</span>
        <span className="text-muted">{label}</span>
      </span>
      <span className="tabular text-muted">
        {formatDuration(session.actualMs)} · {formatTime(session.endedAt)}
      </span>
    </li>
  );
}
