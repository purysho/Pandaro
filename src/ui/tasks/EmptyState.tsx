import { type TaskFilter } from '../../domain/tasks/types';

export function EmptyState({ filter, hasAny }: { filter: TaskFilter; hasAny: boolean }) {
  const text =
    filter === 'done'
      ? 'Finished tasks will rest here.'
      : hasAny && filter === 'active'
        ? 'Everything is done. Add something new, or enjoy the calm.'
        : 'No tasks yet. Add one above, then pick it as your focus.';
  return (
    <p className="rounded-2xl border-[1.5px] border-dashed border-line px-4 py-8 text-center text-muted">
      {text}
    </p>
  );
}
