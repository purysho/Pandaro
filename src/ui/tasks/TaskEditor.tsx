import { useState, type FormEvent } from 'react';
import { ESTIMATE_MAX, NOTES_MAX, TITLE_MAX, type Task } from '../../domain/tasks/types';
import { useTasks } from '../../state/taskStore';

export function TaskEditor({ task, onDone }: { task: Task; onDone(): void }) {
  const update = useTasks((s) => s.update);
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);
  const [estimate, setEstimate] = useState<number | null>(task.estimate);

  function save(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    update(task.id, { title, notes, estimate });
    onDone();
  }

  return (
    <li className="rounded-2xl border-[1.5px] border-accent bg-surface p-3">
      <form onSubmit={save} className="flex flex-col gap-2" aria-label={`Edit “${task.title}”`}>
        <label className="text-sm font-semibold" htmlFor={`title-${task.id}`}>
          Title
        </label>
        <input
          id={`title-${task.id}`}
          className="field"
          value={title}
          maxLength={TITLE_MAX}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onDone()}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- focus moves into the editor the user just opened
          autoFocus
        />
        <label className="text-sm font-semibold" htmlFor={`notes-${task.id}`}>
          Notes <span className="font-normal text-muted">(optional)</span>
        </label>
        <textarea
          id={`notes-${task.id}`}
          className="field min-h-20"
          value={notes}
          maxLength={NOTES_MAX}
          onChange={(e) => setNotes(e.target.value)}
        />
        <label className="text-sm font-semibold" htmlFor={`est-${task.id}`}>
          Estimated sessions
        </label>
        <input
          id={`est-${task.id}`}
          className="field w-28"
          type="number"
          inputMode="numeric"
          min={1}
          max={ESTIMATE_MAX}
          value={estimate ?? ''}
          onChange={(e) => setEstimate(e.target.value ? Number(e.target.value) : null)}
        />
        <div className="mt-1 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onDone}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={!title.trim()}>
            Save
          </button>
        </div>
      </form>
    </li>
  );
}
