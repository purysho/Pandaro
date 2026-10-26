import type { ReactNode } from 'react';

const R = 46;
const C = 2 * Math.PI * R;

/**
 * Circular progress that fills clockwise from 12 o'clock as the session elapses.
 * The arc is derived from the current progress on every frame, so it never drifts.
 */
export function ProgressRing({ progress, children }: { progress: number; children?: ReactNode }) {
  const p = Math.min(1, Math.max(0, progress));
  return (
    <div className="relative aspect-square w-full">
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 h-full w-full -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={50}
          cy={50}
          r={R}
          fill="var(--surface)"
          stroke="var(--surface-2)"
          strokeWidth={3.2}
        />
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * 2 * Math.PI;
          return (
            <line
              key={i}
              x1={50 + Math.cos(a) * 41.2}
              y1={50 + Math.sin(a) * 41.2}
              x2={50 + Math.cos(a) * (i % 3 === 0 ? 39.2 : 40.2)}
              y2={50 + Math.sin(a) * (i % 3 === 0 ? 39.2 : 40.2)}
              stroke="var(--line)"
              strokeWidth={0.8}
              strokeLinecap="round"
            />
          );
        })}
        <circle
          className="ring-progress"
          cx={50}
          cy={50}
          r={R}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={3.2}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - p)}
          opacity={p === 0 ? 0 : 1}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}
