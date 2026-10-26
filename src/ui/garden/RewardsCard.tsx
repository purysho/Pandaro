import { useMemo, useState } from 'react';
import {
  ACCESSORIES,
  COMMITMENT_MULTIPLIER,
  COMMITMENT_OPTIONS,
  canBuy,
  commitmentProgress,
  type CommitmentDays,
  type RewardStyle,
} from '../../domain/rewards/rewards';
import { dateKey } from '../../domain/stats/dates';
import { useHistory } from '../../state/historyStore';
import { activeDates, useRewards, walletOf } from '../../state/rewardStore';
import { useSettings } from '../../state/settingsStore';
import { useTimer } from '../../state/timerStore';
import { Icon } from '../components/Icon';
import { Panda } from '../panda/Panda';

const STYLES: { id: RewardStyle; label: string; body: string }[] = [
  {
    id: 'daily',
    label: 'Daily shoot',
    body: 'One bamboo shoot on each day you finish a focus session. Missing a day costs nothing.',
  },
  {
    id: 'growing',
    label: 'Growing',
    body: 'Up to 5 shoots a day. Each focus day adds one; a missed day steps back one, never to zero.',
  },
  {
    id: 'commitment',
    label: 'Commitment',
    body: 'Choose 3, 7, 14 or 30 days. Bigger commitments earn more, you get two grace days, and a bonus when you finish.',
  },
  {
    id: 'off',
    label: 'No daily rewards',
    body: 'Just the garden: it still grows with every completed session.',
  },
];

export function RewardsCard() {
  const ledger = useRewards((s) => s.ledger);
  const buy = useRewards((s) => s.buy);
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const w = useMemo(() => walletOf(ledger), [ledger]);

  return (
    <section
      aria-labelledby="rewards-heading"
      className="flex flex-col gap-4 rounded-2xl bg-surface-2 p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="rewards-heading" className="text-lg font-bold">
          Bamboo shoots
        </h3>
        <p
          className="flex items-center gap-1.5 font-display text-xl font-bold tabular"
          aria-live="polite"
        >
          <Icon name="leaf" size={20} />
          {w.balance}
          <span className="sr-only">shoots to spend</span>
        </p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">How you earn them</legend>
        {STYLES.map((s) => (
          <div
            key={s.id}
            className={`flex gap-3 rounded-xl border-[1.5px] bg-surface p-3 ${
              settings.rewardStyle === s.id ? 'border-focus' : 'border-transparent'
            }`}
          >
            <input
              id={`reward-style-${s.id}`}
              type="radio"
              name="reward-style"
              value={s.id}
              checked={settings.rewardStyle === s.id}
              onChange={() => update({ rewardStyle: s.id })}
              aria-describedby={`reward-style-${s.id}-body`}
              className="mt-1 accent-[var(--focus)]"
            />
            <div>
              <label htmlFor={`reward-style-${s.id}`} className="cursor-pointer font-semibold">
                {s.label}
              </label>
              <p id={`reward-style-${s.id}-body`} className="text-sm text-muted">
                {s.body}
              </p>
            </div>
          </div>
        ))}
      </fieldset>

      {settings.rewardStyle === 'commitment' && <CommitmentCard />}

      <div>
        <p className="mb-2 text-sm font-semibold">Panda wardrobe</p>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ACCESSORIES.map((a) => {
            const owned = w.owned.includes(a.id);
            const wearing = settings.accessory === a.id;
            return (
              <li
                key={a.id}
                className="flex flex-col items-center gap-1 rounded-xl bg-surface p-2 text-center"
              >
                <Panda pose="idle" size={64} accessory={a.id} />
                <span className="text-sm font-semibold">{a.label}</span>
                {owned ? (
                  <button
                    type="button"
                    className="chip border-line"
                    aria-pressed={wearing}
                    onClick={() => update({ accessory: wearing ? 'none' : a.id })}
                  >
                    {wearing ? 'Wearing' : 'Wear'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-ghost min-h-9 px-3 text-sm"
                    disabled={!canBuy(w, a.id)}
                    onClick={() => void buy(a.id, Date.now())}
                    aria-label={`Buy ${a.label} for ${a.price} shoots`}
                  >
                    <Icon name="leaf" size={14} /> {a.price}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-muted">
          Shoots are just for fun: they never unlock or limit any timer, task or statistics feature.
        </p>
      </div>
    </section>
  );
}

function CommitmentCard() {
  const commitment = useSettings((s) => s.settings.commitment);
  const update = useSettings((s) => s.update);
  const [choice, setChoice] = useState<CommitmentDays | null>(null);
  const sessions = useHistory((s) => s.sessions);
  const minute = useTimer((s) => Math.floor(s.now / 60_000) * 60_000);
  const today = dateKey(minute);
  const progress = useMemo(
    () => (commitment ? commitmentProgress(commitment, activeDates(sessions), today) : null),
    [commitment, sessions, today],
  );

  if (progress && progress.status === 'active') {
    const pct = Math.round((progress.activeDays / progress.commitment.days) * 100);
    return (
      <div className="rounded-xl bg-surface p-3" role="region" aria-label="Your commitment">
        <p className="font-semibold">
          {progress.activeDays} of {progress.commitment.days} focus days
        </p>
        <div
          className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={progress.commitment.days}
          aria-valuenow={progress.activeDays}
          aria-label="Commitment progress"
        >
          <div
            className="h-full rounded-full bg-focus transition-[width]"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2 text-sm text-muted">
          {progress.graceLeft} grace day{progress.graceLeft === 1 ? '' : 's'} left. Earning ×
          {COMMITMENT_MULTIPLIER[progress.commitment.days]} shoots, plus {progress.commitment.days}{' '}
          when you finish.
        </p>
        <button
          type="button"
          className="btn mt-1 px-0 text-sm text-muted underline"
          onClick={() => update({ commitment: null })}
        >
          End this commitment
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-surface p-3" role="region" aria-label="Choose a commitment">
      {progress?.status === 'completed' && (
        <p className="mb-2 font-semibold">
          You finished your {progress.commitment.days}-day commitment. Wonderful.
        </p>
      )}
      {progress?.status === 'lapsed' && (
        <p className="mb-2 text-sm text-muted">
          That commitment has ended. No harm done; start a new one whenever you like.
        </p>
      )}
      <p className="font-semibold">How many days will you commit to?</p>
      <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Commitment length">
        {COMMITMENT_OPTIONS.map((d) => (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={choice === d}
            className="chip border-line"
            onClick={() => setChoice(d)}
          >
            {d} days · ×{COMMITMENT_MULTIPLIER[d]}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="btn btn-primary mt-3"
        disabled={choice === null}
        onClick={() => {
          if (choice === null) return;
          update({
            commitment: { id: `c-${Date.now().toString(36)}`, days: choice, startDate: today },
          });
        }}
      >
        Start commitment
      </button>
    </div>
  );
}
