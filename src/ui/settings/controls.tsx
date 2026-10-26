import { useId, useState, type ReactNode } from 'react';
import type { Settings } from '../../persistence/schema';
import { applyTheme } from '../../state/engine';
import { useSettings } from '../../state/settingsStore';
import { useTimer } from '../../state/timerStore';

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="eyebrow">{title}</h3>
      {children}
    </section>
  );
}

export function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange(on: boolean): void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <label htmlFor={id} className="font-semibold">
          {label}
        </label>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="relative h-8 w-14 shrink-0 rounded-full transition-colors"
        style={{ background: checked ? 'var(--focus)' : 'var(--line)' }}
      >
        <span
          className="absolute top-1 size-6 rounded-full bg-surface shadow transition-transform"
          style={{ left: 4, transform: checked ? 'translateX(24px)' : 'none' }}
        />
      </button>
    </div>
  );
}

export function NumberField({
  label,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange(n: number): void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(String(value));
  }
  const commit = () => {
    const n = Math.round(Number(draft));
    if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
    else setDraft(String(value));
  };
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          className="field w-20 tabular"
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
        />
        <span className="text-sm text-muted">{unit}</span>
      </div>
    </div>
  );
}

export type Patch = Partial<Omit<Settings, 'v'>>;

/** Update settings, re-apply timer durations and the theme where relevant. */
export function useSetting() {
  const update = useSettings((s) => s.update);
  return (patch: Patch) => {
    update(patch);
    useTimer.getState().applySettings();
    if ('theme' in patch || 'reduceMotion' in patch) applyTheme();
  };
}
