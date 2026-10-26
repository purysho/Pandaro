/** Pandaro mark: a panda face inside a bamboo-green ring, with the wordmark. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx={32} cy={32} r={30} fill="var(--focus)" />
      <circle cx={17} cy={19} r={7} fill="var(--patch)" />
      <circle cx={47} cy={19} r={7} fill="var(--patch)" />
      <ellipse cx={32} cy={35} rx={20} ry={18} fill="var(--fur)" />
      <ellipse
        cx={24.5}
        cy={35}
        rx={5}
        ry={6.5}
        transform="rotate(28 24.5 35)"
        fill="var(--patch)"
      />
      <ellipse
        cx={39.5}
        cy={35}
        rx={5}
        ry={6.5}
        transform="rotate(-28 39.5 35)"
        fill="var(--patch)"
      />
      <circle cx={25} cy={34.5} r={1.8} fill="var(--fur)" />
      <circle cx={39} cy={34.5} r={1.8} fill="var(--fur)" />
      <ellipse cx={32} cy={41} rx={2.6} ry={1.9} fill="var(--patch)" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <LogoMark />
      <span className="font-display text-xl font-bold tracking-tight">Pandaro</span>
    </span>
  );
}
