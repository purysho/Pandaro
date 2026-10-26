import type { ReactNode } from 'react';

export type PandaPose =
  'idle' | 'focus' | 'break' | 'paused' | 'celebrate' | 'cycle' | 'stretch' | 'wave';

interface PandaProps {
  pose: PandaPose;
  size?: number | string;
  className?: string;
  /** Accessible description; the panda is decorative when omitted. */
  title?: string;
}

/*
 * Original Pandaro mascot. Hand-built from simple shapes so it stays crisp at any density,
 * themes through CSS variables, and animates with transforms only.
 * viewBox: 200 × 200, panda sits on y≈182.
 */

const PATCH = 'var(--patch)';
const FUR = 'var(--fur)';

function Eyes({ mode }: { mode: 'open' | 'down' | 'closed' | 'sleepy' | 'happy' }) {
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

function Mouth({ open }: { open: boolean }) {
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

function Head({
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

function Body({ children }: { children?: ReactNode }) {
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

function RestingArms() {
  return (
    <g fill={PATCH}>
      <ellipse cx={58} cy={146} rx={14} ry={26} transform="rotate(16 58 146)" />
      <ellipse cx={142} cy={146} rx={14} ry={26} transform="rotate(-16 142 146)" />
    </g>
  );
}

function RaisedArms({ wave = false }: { wave?: boolean }) {
  return (
    <g fill={PATCH}>
      <ellipse cx={52} cy={108} rx={13} ry={26} transform="rotate(-32 52 108)" />
      <g className={wave ? 'panda-wave' : undefined}>
        <ellipse cx={148} cy={108} rx={13} ry={26} transform="rotate(32 148 108)" />
      </g>
    </g>
  );
}

function WaveArms() {
  return (
    <g fill={PATCH}>
      <ellipse cx={58} cy={146} rx={14} ry={26} transform="rotate(16 58 146)" />
      <g className="panda-wave">
        <ellipse cx={150} cy={110} rx={13} ry={26} transform="rotate(34 150 110)" />
      </g>
    </g>
  );
}

function Book() {
  return (
    <g>
      <rect x={64} y={136} width={72} height={30} rx={4} fill="var(--accent)" />
      <path d="M68 136 Q84 129 100 136 L100 162 Q84 155 68 162 Z" fill="var(--surface)" />
      <g className="panda-page">
        <path d="M100 136 Q116 129 132 136 L132 162 Q116 155 100 162 Z" fill="var(--surface)" />
      </g>
      <g stroke="var(--line)" strokeWidth={1.4} strokeLinecap="round">
        <path d="M74 142 Q84 138 94 142" />
        <path d="M74 148 Q84 144 94 148" />
        <path d="M106 142 Q116 138 126 142" />
        <path d="M106 148 Q116 144 126 148" />
      </g>
      <path d="M100 136 L100 162" stroke="var(--line)" strokeWidth={1.5} />
      <g fill={PATCH}>
        <ellipse cx={66} cy={150} rx={12} ry={18} transform="rotate(-50 66 150)" />
        <ellipse cx={134} cy={150} rx={12} ry={18} transform="rotate(50 134 150)" />
      </g>
    </g>
  );
}

function Tea() {
  return (
    <g>
      <g
        className="panda-steam"
        stroke="var(--ink-muted)"
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        opacity={0.7}
      >
        <path d="M94 128 Q90 122 94 116 Q98 110 94 104" />
        <path d="M106 128 Q102 122 106 116 Q110 110 106 104" />
      </g>
      <path d="M84 134 L116 134 L112 160 Q100 166 88 160 Z" fill="var(--accent)" />
      <path
        d="M116 140 Q126 140 124 148 Q122 154 113 152"
        fill="none"
        stroke="var(--accent)"
        strokeWidth={4}
      />
      <ellipse cx={100} cy={134} rx={16} ry={3.5} fill="var(--bamboo-deep)" opacity={0.6} />
      <g fill={PATCH}>
        <ellipse cx={78} cy={150} rx={12} ry={17} transform="rotate(-40 78 150)" />
        <ellipse cx={124} cy={152} rx={12} ry={17} transform="rotate(40 124 152)" />
      </g>
    </g>
  );
}

function Leaves() {
  return (
    <g fill="var(--bamboo)">
      <path className="panda-leaf" d="M40 40 q8 -6 14 0 q-6 8 -14 0z" />
      <path className="panda-leaf" d="M150 30 q8 -6 14 0 q-6 8 -14 0z" />
      <path className="panda-leaf" d="M100 20 q8 -6 14 0 q-6 8 -14 0z" />
    </g>
  );
}

function Sprout() {
  return (
    <g className="panda-sprout">
      <rect x={166} y={140} width={6} height={44} rx={3} fill="var(--bamboo)" />
      <rect x={165} y={160} width={8} height={3} rx={1.5} fill="var(--bamboo-deep)" />
      <path d="M172 148 q12 -10 22 -4 q-10 8 -22 4z" fill="var(--bamboo)" />
      <path d="M166 156 q-12 -10 -22 -4 q10 8 22 4z" fill="var(--bamboo)" />
    </g>
  );
}

export function Panda({ pose, size = '100%', className, title }: PandaProps) {
  const labelled = title !== undefined;
  let arms: ReactNode;
  let eyes: Parameters<typeof Eyes>[0]['mode'] = 'open';
  let mouthOpen = false;
  let extras: ReactNode = null;
  let wrapperClass = 'panda-breathe';

  switch (pose) {
    case 'focus':
      arms = <Book />;
      eyes = 'down';
      break;
    case 'break':
      arms = <Tea />;
      eyes = 'happy';
      break;
    case 'paused':
      arms = <RestingArms />;
      eyes = 'sleepy';
      break;
    case 'celebrate':
      arms = <RaisedArms wave />;
      eyes = 'happy';
      mouthOpen = true;
      extras = <Leaves />;
      wrapperClass = 'panda-hop';
      break;
    case 'cycle':
      arms = <RaisedArms wave />;
      eyes = 'happy';
      mouthOpen = true;
      extras = (
        <>
          <Leaves />
          <Sprout />
        </>
      );
      wrapperClass = 'panda-hop';
      break;
    case 'stretch':
      arms = <RaisedArms />;
      eyes = 'closed';
      mouthOpen = true;
      break;
    case 'wave':
      arms = <WaveArms />;
      mouthOpen = true;
      break;
    case 'idle':
      arms = <RestingArms />;
      break;
  }

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={`panda ${className ?? ''}`}
      role={labelled ? 'img' : undefined}
      aria-label={title}
      aria-hidden={labelled ? undefined : true}
      data-pose={pose}
    >
      <g className={wrapperClass}>
        <Body />
        <Head eyes={eyes} mouthOpen={mouthOpen} />
        {arms}
      </g>
      {extras}
    </svg>
  );
}
