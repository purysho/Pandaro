import { SEGMENTS_PER_STALK, type UnlockId } from '../../domain/garden/garden';
import { Panda } from '../panda/Panda';

export function GardenScene({
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
          <g key={i} className="grow-up" style={{ animationDelay: `${i * 70}ms` }}>
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
