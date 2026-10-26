import { Section, Toggle, useSetting } from './controls';
import { useSettings } from '../../state/settingsStore';

export function BehaviourSection() {
  const s = useSettings((x) => x.settings);
  const set = useSetting();
  return (
    <Section title="Sessions">
      <Toggle
        label="Move to the next session automatically"
        description="After focus comes a break, after a break comes focus."
        checked={s.autoProgress}
        onChange={(v) => set({ autoProgress: v })}
      />
      <Toggle
        label="Start breaks automatically"
        checked={s.autoStartBreaks}
        onChange={(v) => set({ autoStartBreaks: v })}
        disabled={!s.autoProgress}
      />
      <Toggle
        label="Start focus automatically"
        checked={s.autoStartFocus}
        onChange={(v) => set({ autoStartFocus: v })}
        disabled={!s.autoProgress}
      />
      <p className="text-sm text-muted">
        Sessions that end while Pandaro is closed are recorded, but the next one waits for you.
      </p>
    </Section>
  );
}
