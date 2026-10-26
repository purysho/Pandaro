import { useState } from 'react';
import { KEYS, readFlag, writeFlag } from '../../persistence/storage';
import { Panda, type PandaPose } from '../panda/Panda';
import { Modal } from './Modal';

const CARDS: { pose: PandaPose; title: string; body: string }[] = [
  {
    pose: 'wave',
    title: 'Meet your focus panda',
    body: 'Pandaro helps you work in calm, focused sessions: 25 minutes of focus, then a short break. After four, a longer rest.',
  },
  {
    pose: 'focus',
    title: 'Pick one thing',
    body: 'Add a task and set it as your current focus. Each finished session is counted toward that task.',
  },
  {
    pose: 'break',
    title: 'Rest, grow, repeat',
    body: 'Breaks matter too. Every finished session grows your bamboo garden. Everything stays on this device, with no account.',
  },
];

export function Onboarding() {
  const [open, setOpen] = useState(() => !readFlag(KEYS.onboarded));
  const [step, setStep] = useState(0);
  const card = CARDS[step] ?? CARDS[0];
  const finish = () => {
    writeFlag(KEYS.onboarded, true);
    setOpen(false);
  };
  if (!card) return null;
  return (
    <Modal open={open} title="Welcome to Pandaro" onClose={finish}>
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="w-36">
          <Panda pose={card.pose} />
        </div>
        <h3 className="text-2xl font-bold">{card.title}</h3>
        <p className="text-muted">{card.body}</p>
        <div className="flex gap-2" aria-label={`Step ${step + 1} of ${CARDS.length}`} role="img">
          {CARDS.map((_, i) => (
            <span
              key={i}
              className="size-2 rounded-full"
              style={{ background: i === step ? 'var(--focus)' : 'var(--line)' }}
            />
          ))}
        </div>
        <div className="mt-2 flex w-full justify-between gap-2">
          <button type="button" className="btn" onClick={finish}>
            Skip
          </button>
          {step < CARDS.length - 1 ? (
            <button type="button" className="btn btn-primary" onClick={() => setStep(step + 1)}>
              Next
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={finish}>
              Start focusing
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
