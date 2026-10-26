import { useMemo } from 'react';
import { deriveGarden, UNLOCKS, type UnlockId } from '../../domain/garden/garden';
import { totalCompletedFocus } from '../../domain/stats/metrics';
import { useHistory } from '../../state/historyStore';
import { useSettings } from '../../state/settingsStore';
import { Icon } from '../components/Icon';
import { Panda } from '../panda/Panda';
import { GardenScene } from './GardenScene';

export function GardenPanel() {
  const sessions = useHistory((s) => s.sessions);
  const pandaPose = useSettings((s) => s.settings.pandaPose);
  const update = useSettings((s) => s.update);
  const garden = useMemo(() => deriveGarden(totalCompletedFocus(sessions)), [sessions]);
  const has = (id: UnlockId) => garden.unlocked.some((u) => u.id === id);

  return (
    <section aria-labelledby="garden-heading" className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="garden-heading" className="text-2xl font-bold">
          Panda Garden
        </h2>
        <p className="text-sm text-muted tabular">{garden.sessions} sessions grown</p>
      </div>
      <p className="text-muted">
        Every completed focus session helps the bamboo grow. Nothing withers, and there are no
        streaks to lose.
      </p>

      <GardenScene
        stalks={garden.stalks.map((s) => s.segments)}
        has={has}
        sessions={garden.sessions}
      />

      <p className="text-sm text-muted" role="status">
        {garden.sessions === 0
          ? 'Complete a focus session to plant your first sprout.'
          : garden.untilNextSegment > 0
            ? `${garden.untilNextSegment} more session${garden.untilNextSegment === 1 ? '' : 's'} until the bamboo grows again.`
            : 'Your grove is fully grown. Beautiful work.'}
        {garden.next &&
          ` Next unlock: ${garden.next.label} at ${garden.next.at} session${garden.next.at === 1 ? '' : 's'}.`}
      </p>

      <div>
        <h3 className="text-lg font-bold">Milestones</h3>
        <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {UNLOCKS.map((u) => {
            const unlocked = garden.sessions >= u.at;
            return (
              <li
                key={u.id}
                className="flex items-center gap-3 rounded-2xl bg-surface-2 px-3 py-2.5"
                aria-label={`${u.label}: ${unlocked ? 'unlocked' : `unlocks at ${u.at} sessions`}`}
              >
                <span
                  className="grid size-8 place-items-center rounded-full"
                  style={{
                    background: unlocked ? 'var(--bamboo)' : 'transparent',
                    border: unlocked ? 'none' : '1.5px dashed var(--line)',
                    color: 'var(--on-accent)',
                  }}
                >
                  {unlocked ? (
                    <span className="unlock-reveal grid place-items-center">
                      <Icon name="check" size={16} className="check-draw" />
                    </span>
                  ) : (
                    <span className="text-xs text-muted tabular">{u.at}</span>
                  )}
                </span>
                <span className={unlocked ? 'font-semibold' : 'text-muted'}>{u.label}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <fieldset className="rounded-2xl bg-surface-2 p-4">
        <legend className="sr-only">Break pose</legend>
        <p className="font-bold">Panda break pose</p>
        <div className="mt-3 flex flex-wrap gap-3">
          {(
            [
              { id: 'default', label: 'Tea time', pose: 'break', locked: false },
              {
                id: 'pose-stretch',
                label: 'Stretching',
                pose: 'stretch',
                locked: !has('pose-stretch'),
              },
            ] as const
          ).map((option) => (
            <label
              key={option.id}
              className={`flex cursor-pointer items-center gap-2 rounded-2xl border-[1.5px] bg-surface px-3 py-2 ${
                pandaPose === option.id ? 'border-focus' : 'border-transparent'
              } ${option.locked ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              <input
                type="radio"
                name="panda-pose"
                value={option.id}
                checked={pandaPose === option.id}
                disabled={option.locked}
                onChange={() => update({ pandaPose: option.id })}
                className="accent-[var(--focus)]"
              />
              <Panda pose={option.pose} size={48} />
              <span>
                {option.label}
                {option.locked && (
                  <span className="block text-xs text-muted">Unlocks at 5 sessions</span>
                )}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </section>
  );
}
