import type { AccessoryId } from '../../domain/rewards/rewards';

/** Cosmetic items drawn on the 200×200 panda canvas, above the head and body. */
export function Accessory({ id }: { id: AccessoryId | 'none' }) {
  switch (id) {
    case 'flower':
      return (
        <g aria-hidden="true" transform="translate(140 34)">
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse
              key={a}
              cx={0}
              cy={-7}
              rx={5}
              ry={8}
              fill="#f2b8c6"
              transform={`rotate(${a})`}
            />
          ))}
          <circle r={4} fill="#e98aa3" />
        </g>
      );
    case 'scarf':
      return (
        <g aria-hidden="true">
          <path d="M58 116 Q100 132 142 116 L144 128 Q100 144 56 128 Z" fill="#c2553f" />
          <path d="M120 128 L128 160 L114 162 L110 132 Z" fill="#a84634" />
          <path
            d="M62 122 Q100 136 138 122"
            fill="none"
            stroke="#e7a08f"
            strokeWidth={2}
            strokeDasharray="4 4"
          />
        </g>
      );
    case 'glasses':
      return (
        <g aria-hidden="true" fill="none" stroke="#3b3a35" strokeWidth={3}>
          <circle cx={82} cy={80} r={12} />
          <circle cx={118} cy={80} r={12} />
          <path d="M94 79 Q100 74 106 79" />
          <path d="M70 78 L56 72" />
          <path d="M130 78 L144 72" />
        </g>
      );
    case 'bamboo-hat':
      return (
        <g aria-hidden="true">
          <path d="M34 50 L100 12 L166 50 Q100 62 34 50 Z" fill="#d9b26a" />
          <path d="M34 50 Q100 62 166 50" fill="none" stroke="#b08a45" strokeWidth={3} />
          <path
            d="M67 31 L100 12 L133 31"
            fill="none"
            stroke="#b08a45"
            strokeWidth={1.5}
            opacity={0.6}
          />
        </g>
      );
    case 'none':
      return null;
  }
}
