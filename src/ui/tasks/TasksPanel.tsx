import { useMemo } from 'react';
import { visibleTasks } from '../../domain/tasks/rules';
import { type TaskFilter } from '../../domain/tasks/types';
import { useTasks } from '../../state/taskStore';
import { useTimer } from '../../state/timerStore';
import { clearCompleted } from '../actions';
import { EmptyState } from './EmptyState';
import { QuickAdd } from './QuickAdd';
import { TaskRow } from './TaskRow';

export const FILTERS: { id: TaskFilter; label: string }[] = [
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
