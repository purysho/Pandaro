import { PATCH } from './parts';

export function RestingArms() {
  return (
    <g fill={PATCH}>
      <ellipse cx={58} cy={146} rx={14} ry={26} transform="rotate(16 58 146)" />
      <ellipse cx={142} cy={146} rx={14} ry={26} transform="rotate(-16 142 146)" />
    </g>
  );
}

export function RaisedArms({ wave = false }: { wave?: boolean }) {
  return (
    <g fill={PATCH}>
      <ellipse cx={52} cy={108} rx={13} ry={26} transform="rotate(-32 52 108)" />
      <g className={wave ? 'panda-wave' : undefined}>
        <ellipse cx={148} cy={108} rx={13} ry={26} transform="rotate(32 148 108)" />
      </g>
    </g>
  );
}

export function WaveArms() {
  return (
    <g fill={PATCH}>
      <ellipse cx={58} cy={146} rx={14} ry={26} transform="rotate(16 58 146)" />
      <g className="panda-wave">
        <ellipse cx={150} cy={110} rx={13} ry={26} transform="rotate(34 150 110)" />
      </g>
    </g>
  );
}
