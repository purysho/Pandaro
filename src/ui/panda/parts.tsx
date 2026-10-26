import type { ReactNode } from 'react';

/*
 * Original Pandaro mascot. Hand-built from simple shapes so it stays crisp at any density,
 * themes through CSS variables, and animates with transforms only.
 * viewBox: 200 × 200, panda sits on y≈182.
 */

export const PATCH = 'var(--patch)';

export const FUR = 'var(--fur)';

export function Eyes({ mode }: { mode: 'open' | 'down' | 'closed' | 'sleepy' | 'happy' }) {
  if (mode === 'closed' || mode === 'happy') {
    const d = mode === 'happy' ? 'M-5 1 Q0 -4 5 1' : 'M-5 0 Q0 3 5 0';
    return (
      <g stroke={FUR} strokeWidth={2.6} strokeLinecap="round" fill="none">
        <path d={d} transform="translate(82 80)" />
        <path d={d} transform="translate(118 80)" />
      </g>
    );
  }
  const dy = mode === 'down' ? 2 : 0;
  return (
    <g className={mode === 'open' ? 'panda-eyes' : undefined}>
      <circle cx={82} cy={79} r={5} fill={FUR} />
      <circle cx={118} cy={79} r={5} fill={FUR} />
      <circle cx={82.6} cy={79.6 + dy} r={2.8} fill="var(--ink)" />
      <circle cx={118.6} cy={79.6 + dy} r={2.8} fill="var(--ink)" />
      <circle cx={83.6} cy={78 + dy} r={0.9} fill={FUR} />
      <circle cx={119.6} cy={78 + dy} r={0.9} fill={FUR} />
      {mode === 'sleepy' && (
        <g fill={PATCH}>
          <rect x={75} y={72} width={14} height={7} rx={2} />
          <rect x={111} y={72} width={14} height={7} rx={2} />
        </g>
      )}
    </g>
  );
}

export function Mouth({ open }: { open: boolean }) {
  return open ? (
    <path
      d="M93 102 Q100 112 107 102 Z"
      fill="var(--blush)"
      stroke={PATCH}
      strokeWidth={2}
      strokeLinejoin="round"
    />
  ) : (
    <path
      d="M94 103 Q97 106 100 103 Q103 106 106 103"
      fill="none"
      stroke={PATCH}
      strokeWidth={2}
      strokeLinecap="round"
    />
  );
}

export function Head({
  eyes,
  mouthOpen = false,
}: {
  eyes: Parameters<typeof Eyes>[0]['mode'];
  mouthOpen?: boolean;
}) {
  return (
    <g>
      <circle cx={60} cy={44} r={17} fill={PATCH} />
      <circle cx={140} cy={44} r={17} fill={PATCH} />
      <circle cx={61} cy={46} r={8} fill="var(--fur-shade)" opacity={0.25} />
      <circle cx={139} cy={46} r={8} fill="var(--fur-shade)" opacity={0.25} />
      <ellipse cx={100} cy={80} rx={52} ry={45} fill={FUR} />
      <ellipse cx={100} cy={112} rx={34} ry={8} fill="var(--fur-shade)" opacity={0.5} />
      <ellipse cx={81} cy={81} rx={13} ry={17} transform="rotate(28 81 81)" fill={PATCH} />
      <ellipse cx={119} cy={81} rx={13} ry={17} transform="rotate(-28 119 81)" fill={PATCH} />
      <Eyes mode={eyes} />
      <ellipse cx={100} cy={96} rx={6.5} ry={4.6} fill={PATCH} />
      <Mouth open={mouthOpen} />
      <ellipse cx={68} cy={99} rx={7} ry={4} fill="var(--blush)" opacity={0.45} />
      <ellipse cx={132} cy={99} rx={7} ry={4} fill="var(--blush)" opacity={0.45} />
    </g>
  );
}

export function Body({ children }: { children?: ReactNode }) {
  return (
    <g>
      <ellipse cx={100} cy={184} rx={60} ry={7} fill="var(--ink)" opacity={0.08} />
      <ellipse cx={64} cy={170} rx={23} ry={15} fill={PATCH} />
      <ellipse cx={136} cy={170} rx={23} ry={15} fill={PATCH} />
      <ellipse cx={62} cy={172} rx={9} ry={6} fill="var(--fur-shade)" opacity={0.3} />
      <ellipse cx={138} cy={172} rx={9} ry={6} fill="var(--fur-shade)" opacity={0.3} />
      <ellipse cx={100} cy={142} rx={50} ry={42} fill={FUR} />
      <path d="M58 122 Q100 108 142 122 L142 132 Q100 118 58 132 Z" fill={PATCH} />
      {children}
    </g>
  );
}
