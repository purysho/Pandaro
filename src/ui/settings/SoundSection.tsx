import { useId } from 'react';
import { chime } from '../../platform/audio/chime';
import { Section, Toggle, useSetting } from './controls';
import { useSettings } from '../../state/settingsStore';

export function SoundSection() {
  const s = useSettings((x) => x.settings);
  const set = useSetting();
  const volumeId = useId();
  return (
    <Section title="Sound">
      <Toggle
        label="Chime when a session ends"
        checked={s.sound}
        onChange={(v) => set({ sound: v })}
      />
      <div className="flex flex-col gap-1">
        <label htmlFor={volumeId} className="text-sm font-semibold">
          Volume <span className="tabular text-muted">{s.volume}%</span>
        </label>
        <div className="flex items-center gap-3">
          <input
            id={volumeId}
            type="range"
            min={0}
            max={100}
            step={5}
            value={s.volume}
            disabled={!s.sound}
            onChange={(e) => set({ volume: Number(e.target.value) })}
            className="flex-1 accent-[var(--focus)]"
          />
          <button
            type="button"
            className="btn btn-ghost"
            disabled={!s.sound || s.volume === 0 || !chime.supported}
            onClick={() => {
              chime.unlock();
              chime.play('toBreak', s.volume / 100);
            }}
          >
            Play
          </button>
        </div>
      </div>
      <Toggle
        label="Different chime when a break ends"
        checked={s.distinctBreakChime}
        onChange={(v) => set({ distinctBreakChime: v })}
        disabled={!s.sound}
      />
      {!chime.supported && (
        <p className="text-sm text-danger">This browser can’t play generated sound.</p>
      )}
    </Section>
  );
}
