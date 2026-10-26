export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** "1h 05m", "25m", "0m" */
export function formatDuration(ms: number): string {
  if (ms > 0 && ms < 60_000) return '<1m';
  const totalMin = Math.floor(Math.max(0, ms) / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/** Spoken form used for screen readers: "12 minutes 30 seconds remaining". */
export function spokenRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  const parts: string[] = [];
  if (m > 0) parts.push(`${m} minute${m === 1 ? '' : 's'}`);
  if (s > 0 || m === 0) parts.push(`${s} second${s === 1 ? '' : 's'}`);
  return `${parts.join(' ')} remaining`;
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatDay(dateKey: string, style: 'short' | 'long' = 'short'): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y ?? 2000, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString(undefined, {
    weekday: style === 'short' ? 'short' : 'long',
    ...(style === 'long' ? { month: 'short', day: 'numeric' } : {}),
  });
}
