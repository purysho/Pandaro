import { useRef, useState, type FormEvent } from 'react';
import { TITLE_MAX } from '../../domain/tasks/types';
import { useTasks } from '../../state/taskStore';
import { useTimer } from '../../state/timerStore';
import { Icon } from '../components/Icon';

export function QuickAdd() {
  const add = useTasks((s) => s.add);
  const [title, setTitle] = useState('');
  const [estimate, setEstimate] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const created = add({ title, estimate }, Date.now());
    if (created) {
      setTitle('');
      setEstimate(null);
      if (!useTimer.getState().timer.taskId) useTimer.getState().setTask(created.id);
    }
    input.current?.focus();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row" aria-label="Add a task">
      <label htmlFor="quick-add" className="sr-only">
        New task
      </label>
      <input
        id="quick-add"
        ref={input}
        className="field flex-1"
        placeholder="What will you focus on?"
        value={title}
        maxLength={TITLE_MAX}
        onChange={(e) => setTitle(e.target.value)}
        autoComplete="off"
        enterKeyHint="done"
      />
      <div className="flex gap-2">
        <label className="flex items-center gap-2 rounded-[0.9rem] border-[1.5px] border-line bg-surface px-3 text-sm text-muted">
          <Icon name="pomodoro" size={18} />
          <span className="sr-only">Estimate for the new task</span>
          <select
            id="quick-add-estimate"
            className="min-h-[2.6rem] bg-transparent text-ink"
            value={estimate ?? ''}
            onChange={(e) => setEstimate(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Est.</option>
            {Array.from({ length: 8 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="btn btn-primary flex-1 sm:flex-none"
          disabled={!title.trim()}
        >
          <Icon name="plus" size={18} /> Add
        </button>
      </div>
    </form>
  );
}
