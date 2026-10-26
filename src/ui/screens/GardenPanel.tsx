import { useMemo } from 'react';
import {
  deriveGarden,
  SEGMENTS_PER_STALK,
  UNLOCKS,
  type UnlockId,
} from '../../domain/garden/garden';
import { totalCompletedFocus } from '../../domain/stats/metrics';
import { useHistory } from '../../state/historyStore';
import { useSettings } from '../../state/settingsStore';
import { Icon } from '../components/Icon';
import { Panda } from '../panda/Panda';

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
        {garden.next && ` Next unlock: ${garden.next.label} at ${garden.next.at} sessions.`}
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
                    <Icon name="check" size={16} />
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

function GardenScene({
  stalks,
  has,
  sessions,
}: {
  stalks: number[];
  has(id: UnlockId): boolean;
  sessions: number;
}) {
  const W = 360;
  const H = 220;
  const ground = 176;
  const seg = 18;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full rounded-3xl"
      role="img"
      aria-label={`Bamboo garden with ${stalks.length} stalk${stalks.length === 1 ? '' : 's'} grown from ${sessions} completed sessions`}
    >
      <rect width={W} height={H} fill="var(--surface-2)" />
      <circle cx={300} cy={46} r={22} fill="var(--surface)" opacity={0.9} />
      <path
        d={`M0 ${ground} Q90 ${ground - 14} 180 ${ground} T360 ${ground} V${H} H0 Z`}
        fill="color-mix(in oklab, var(--bamboo) 30%, var(--surface-2))"
      />

      {has('moon-gate') && (
        <g opacity={0.9}>
          <path
            d={`M232 ${ground} V96 Q232 70 262 70 Q292 70 292 96 V${ground}`}
            fill="none"
            stroke="var(--ink-muted)"
            strokeWidth={8}
          />
        </g>
      )}
      {has('pond') && (
        <ellipse cx={92} cy={ground + 22} rx={46} ry={11} fill="var(--long)" opacity={0.55} />
      )}
      {has('pond') && <path d={`M80 ${ground + 22} q6 -4 12 0 q-6 4 -12 0z`} fill="var(--short)" />}
      {has('bridge') && (
        <path
          d={`M48 ${ground + 18} Q92 ${ground - 6} 136 ${ground + 18}`}
          fill="none"
          stroke="#b5483a"
          strokeWidth={5}
          strokeLinecap="round"
        />
      )}
      {has('stones') &&
        [0, 1, 2, 3].map((i) => (
          <ellipse
            key={i}
            cx={190 + i * 26}
            cy={ground + 18 + (i % 2) * 6}
            rx={10}
            ry={4}
            fill="var(--ink-muted)"
            opacity={0.5}
          />
        ))}

      {stalks.map((segments, i) => {
        const x = 20 + ((i * 53) % 330);
        const h = Math.max(1, segments) * seg;
        return (
          <g key={i}>
            <rect x={x} y={ground - h} width={7} height={h} rx={3.5} fill="var(--bamboo)" />
            {Array.from({ length: Math.max(0, segments - 1) }, (_, j) => (
              <rect
                key={j}
                x={x - 1}
                y={ground - (j + 1) * seg}
                width={9}
                height={2.5}
                rx={1.2}
                fill="var(--bamboo-deep)"
              />
            ))}
            {segments >= Math.min(3, SEGMENTS_PER_STALK) && (
              <path
                d={`M${x + 7} ${ground - h + 10} q14 -10 24 -4 q-10 8 -24 4z`}
                fill="var(--bamboo)"
              />
            )}
            {segments >= 5 && (
              <path
                d={`M${x} ${ground - h + 26} q-14 -10 -24 -4 q10 8 24 4z`}
                fill="var(--bamboo)"
              />
            )}
          </g>
        );
      })}

      {has('lantern') && (
        <g>
          <line
            x1={322}
            y1={ground - 70}
            x2={322}
            y2={ground}
            stroke="var(--ink-muted)"
            strokeWidth={3}
          />
          <rect x={311} y={ground - 92} width={22} height={26} rx={8} fill="var(--short)" />
          <rect
            x={315}
            y={ground - 86}
            width={14}
            height={14}
            rx={4}
            fill="#f6d79a"
            opacity={0.85}
          />
        </g>
      )}

      <g transform={`translate(${W / 2 - 34} ${ground - 66})`}>
        <Panda pose={sessions > 0 ? 'break' : 'idle'} size={68} />
      </g>
    </svg>
  );
}
