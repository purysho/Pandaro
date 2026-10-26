import { useToday } from '../hooks/useToday';
import { formatDuration } from '../format';

export function TodayStrip() {
  const today = useToday();
  const items = [
    { label: 'Sessions', value: String(today.completed), testId: 'today-sessions' },
    { label: 'Focus time', value: formatDuration(today.focusMs), testId: 'today-focus' },
    { label: 'Tasks done', value: String(today.tasksDone), testId: 'today-tasks' },
  ];
  return (
    <section aria-label="Today" className="w-full">
      <h2 className="sr-only">Today</h2>
      <dl className="grid grid-cols-3 divide-x divide-line rounded-2xl bg-surface-2">
        {items.map((item) => (
          <div key={item.label} className="flex flex-col items-center gap-0.5 px-2 py-2.5">
            <dt className="text-xs font-semibold tracking-wide text-muted uppercase">
              {item.label}
            </dt>
            <dd className="tabular font-display text-xl font-bold" data-testid={item.testId}>
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
