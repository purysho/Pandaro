import { useState, type KeyboardEvent } from 'react';
import { type Task } from '../../domain/tasks/types';
import { useTasks } from '../../state/taskStore';
import { deleteTask, setTaskDone, toggleActiveTask } from '../actions';
import { Icon } from '../components/Icon';
import { TaskEditor } from './TaskEditor';

export function TaskRow({
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
      className={`row-enter group flex items-start gap-3 rounded-2xl border-[1.5px] bg-surface px-3 py-2.5 transition-colors ${
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
        {task.done && <Icon name="check" size={16} className="check-draw" />}
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

export function pomodoroLabel(task: Task): string {
  return task.estimate
    ? `${task.completedPomodoros} of ${task.estimate} estimated sessions done`
    : `${task.completedPomodoros} sessions done`;
}
