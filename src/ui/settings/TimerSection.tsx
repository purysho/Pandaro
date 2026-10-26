import { PRESETS } from '../../state/settingsStore';
import { NumberField, Section, useSetting } from './controls';
import { useSettings } from '../../state/settingsStore';

export function TimerSection() {
  const s = useSettings((x) => x.settings);
  const set = useSetting();
  return (
    <Section title="Timer">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Presets">
        {PRESETS.map((p) => {
          const active =
            s.focusMin === p.focusMin && s.shortMin === p.shortMin && s.longMin === p.longMin;
          return (
            <button
              key={p.id}
              type="button"
              className="chip border-line"
              aria-pressed={active}
              onClick={() =>
                set({ focusMin: p.focusMin, shortMin: p.shortMin, longMin: p.longMin })
              }
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <NumberField
          label="Focus"
          value={s.focusMin}
          min={1}
          max={120}
          unit="min"
          onChange={(n) => set({ focusMin: n })}
        />
        <NumberField
          label="Short break"
          value={s.shortMin}
          min={1}
          max={60}
          unit="min"
          onChange={(n) => set({ shortMin: n })}
        />
        <NumberField
          label="Long break"
          value={s.longMin}
          min={1}
          max={90}
          unit="min"
          onChange={(n) => set({ longMin: n })}
        />
        <NumberField
          label="Long break after"
          value={s.cycleLength}
          min={2}
          max={8}
          unit="sessions"
          onChange={(n) => set({ cycleLength: n })}
        />
      </div>
      <p className="text-sm text-muted">
        Changes apply to the next session. A running session keeps its length.
      </p>
    </Section>
  );
}
