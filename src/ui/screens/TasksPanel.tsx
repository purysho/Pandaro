import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { visibleTasks } from '../../domain/tasks/rules';
import {
  ESTIMATE_MAX,
  NOTES_MAX,
  TITLE_MAX,
  type Task,
  type TaskFilter,
} from '../../domain/tasks/types';
import { useTasks } from '../../state/taskStore';
import { useTimer } from '../../state/timerStore';
import { clearCompleted, deleteTask, setTaskDone, toggleActiveTask } from '../actions';
import { Icon } from '../components/Icon';

const FILTERS: { id: TaskFilter; label: string }[] = [
  { id: 'active', label: 'To do' },
  { id: 'done', label: 'Done' },
  { id: 'all', label: 'All' },
];

export function TasksPanel() {
  const tasks = useTasks((s) => s.tasks);
  const filter = useTasks((s) => s.filter);
  const setFilter = useTasks((s) => s.setFilter);
  const activeId = useTimer((s) => s.timer.taskId);
  const list = useMemo(() => visibleTasks(tasks, filter), [tasks, filter]);
  const openCount = tasks.filter((t) => !t.done).length;
  const doneCount = tasks.length - openCount;

  return (
    <section aria-labelledby="tasks-heading" className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="tasks-heading" className="text-2xl font-bold">
          Tasks
        </h2>
        <p className="text-sm text-muted tabular">
          {openCount} to do · {doneCount} done
        </p>
      </div>

      <QuickAdd />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Filter tasks" className="flex rounded-full bg-surface-2 p-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className="chip"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        {doneCount > 0 && (
          <button
            type="button"
            className="btn text-sm text-muted hover:text-ink"
            onClick={clearCompleted}
          >
            Clear completed
          </button>
        )}
      </div>

      {list.length === 0 ? (
        <EmptyState filter={filter} hasAny={tasks.length > 0} />
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Task list">
          {list.map((task, i) => (
            <TaskRow
              key={task.id}
              task={task}
              active={task.id === activeId}
              index={i}
              ordered={list}
              reorderable={filter === 'active'}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function QuickAdd() {
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

function EmptyState({ filter, hasAny }: { filter: TaskFilter; hasAny: boolean }) {
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

function TaskRow({
  task,
  active,
  index,
  ordered,
  reorderable,
}: {
  task: Task;
  active: boolean;
  index: number;
  ordered: Task[];
  reorderable: boolean;
}) {
  const move = useTasks((s) => s.move);
  const [editing, setEditing] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  if (editing) return <TaskEditor task={task} onDone={() => setEditing(false)} />;

  const onKeyDown = (e: KeyboardEvent<HTMLLIElement>) => {
    if (!reorderable || !e.altKey) return;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(task.id, index - 1, ordered);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(task.id, index + 1, ordered);
    }
  };

  return (
    // Keyboard reordering (Alt+↑/↓) bubbles up from the row's buttons; the move buttons are the
    // primary accessible alternative to dragging.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <li
      onKeyDown={onKeyDown}
      draggable={reorderable}
      onDragStart={(e) => e.dataTransfer.setData('text/plain', task.id)}
      onDragOver={(e) => {
        if (!reorderable) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const id = e.dataTransfer.getData('text/plain');
        if (id) move(id, index, ordered);
      }}
      data-active={active || undefined}
      className={`group flex items-start gap-3 rounded-2xl border-[1.5px] bg-surface px-3 py-2.5 transition-colors ${
        active ? 'border-accent' : dragOver ? 'border-ink' : 'border-transparent'
      }`}
      style={active ? { background: 'var(--accent-soft)' } : undefined}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={task.done}
        aria-label={task.done ? `Reopen “${task.title}”` : `Complete “${task.title}”`}
        onClick={() => setTaskDone(task.id, !task.done)}
        className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border-2 transition-colors"
        style={{
          borderColor: task.done ? 'var(--accent)' : 'var(--line)',
          background: task.done ? 'var(--accent)' : 'transparent',
          color: 'var(--on-accent)',
        }}
      >
        {task.done && <Icon name="check" size={16} />}
      </button>

      <div className="min-w-0 flex-1 pt-0.5">
        <p className={`break-words font-semibold ${task.done ? 'text-muted line-through' : ''}`}>
          {task.title}
        </p>
        {task.notes && (
          <p className="mt-0.5 line-clamp-2 text-sm break-words text-muted">{task.notes}</p>
        )}
        <p
          className="mt-1 flex items-center gap-1 text-xs text-muted tabular"
          aria-label={pomodoroLabel(task)}
        >
          <Icon name="pomodoro" size={14} />
          {task.completedPomodoros}
          {task.estimate ? ` / ${task.estimate}` : ''} sessions
          {active && (
            <span className="ml-2 font-semibold" style={{ color: 'var(--accent)' }}>
              · Current focus
            </span>
          )}
        </p>
      </div>

      <div className="flex shrink-0 items-center">
        {!task.done && (
          <button
            type="button"
            className="icon-btn"
            aria-pressed={active}
            aria-label={active ? `Stop focusing on “${task.title}”` : `Focus on “${task.title}”`}
            title={active ? 'Deselect' : 'Set as current focus'}
            onClick={() => toggleActiveTask(task.id)}
            style={active ? { color: 'var(--accent)' } : undefined}
          >
            <Icon name="target" size={20} />
          </button>
        )}
        {reorderable && (
          <span className="hidden flex-col sm:flex">
            <button
              type="button"
              className="icon-btn h-6 w-8"
              aria-label={`Move “${task.title}” up`}
              disabled={index === 0}
              onClick={() => move(task.id, index - 1, ordered)}
            >
              <Icon name="up" size={16} />
            </button>
            <button
              type="button"
              className="icon-btn h-6 w-8"
              aria-label={`Move “${task.title}” down`}
              disabled={index === ordered.length - 1}
              onClick={() => move(task.id, index + 1, ordered)}
            >
              <Icon name="down" size={16} />
            </button>
          </span>
        )}
        <button
          type="button"
          className="icon-btn"
          aria-label={`Edit “${task.title}”`}
          onClick={() => setEditing(true)}
        >
          <Icon name="edit" size={20} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={`Delete “${task.title}”`}
          onClick={() => deleteTask(task.id)}
        >
          <Icon name="trash" size={20} />
        </button>
      </div>
    </li>
  );
}

function pomodoroLabel(task: Task): string {
  return task.estimate
    ? `${task.completedPomodoros} of ${task.estimate} estimated sessions done`
    : `${task.completedPomodoros} sessions done`;
}

function TaskEditor({ task, onDone }: { task: Task; onDone(): void }) {
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
