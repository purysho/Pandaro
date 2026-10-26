import type { ReactNode } from 'react';
import { RaisedArms, RestingArms, WaveArms } from './arms';
import { Body, Eyes, Head } from './parts';
import { Book, Leaves, Sprout, Tea } from './props';

export type PandaPose =
  'idle' | 'focus' | 'break' | 'paused' | 'celebrate' | 'cycle' | 'stretch' | 'wave';

export interface PandaProps {
  pose: PandaPose;
  size?: number | string;
  className?: string;
  /** Accessible description; the panda is decorative when omitted. */
  title?: string;
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
      <g key={pose} className="pose-enter">
        <g className={wrapperClass}>
          <Body />
          <Head eyes={eyes} mouthOpen={mouthOpen} />
          {arms}
        </g>
      </g>
      {extras}
    </svg>
  );
}
