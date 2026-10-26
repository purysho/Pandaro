import { PATCH } from './parts';

export function Book() {
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

export function Tea() {
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

export function Leaves() {
  return (
    <g fill="var(--bamboo)">
      <path className="panda-leaf" d="M40 40 q8 -6 14 0 q-6 8 -14 0z" />
      <path className="panda-leaf" d="M150 30 q8 -6 14 0 q-6 8 -14 0z" />
      <path className="panda-leaf" d="M100 20 q8 -6 14 0 q-6 8 -14 0z" />
    </g>
  );
}

export function Sprout() {
  return (
    <g className="panda-sprout">
      <rect x={166} y={140} width={6} height={44} rx={3} fill="var(--bamboo)" />
      <rect x={165} y={160} width={8} height={3} rx={1.5} fill="var(--bamboo-deep)" />
      <path d="M172 148 q12 -10 22 -4 q-10 8 -22 4z" fill="var(--bamboo)" />
      <path d="M166 156 q-12 -10 -22 -4 q10 8 22 4z" fill="var(--bamboo)" />
    </g>
  );
}
