import { Section, Toggle, useSetting } from './controls';
import { useSettings } from '../../state/settingsStore';

export function DisplaySection() {
  const s = useSettings((x) => x.settings);
  const set = useSetting();
  const themes = [
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
    { id: 'system', label: 'Match system' },
  ] as const;
  return (
    <Section title="Display">
      <div role="radiogroup" aria-label="Theme" className="flex flex-wrap gap-2">
        {themes.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={s.theme === t.id}
            className="chip border-line"
            onClick={() => set({ theme: t.id })}
          >
            {t.label}
          </button>
        ))}
      </div>
      <Toggle
        label="Reduce animation"
        checked={s.reduceMotion}
        onChange={(v) => set({ reduceMotion: v })}
      />
      <Toggle
        label="Focus mode"
        description="Hide tasks and statistics while a session is running."
        checked={s.focusMode}
        onChange={(v) => set({ focusMode: v })}
      />
      <Toggle
        label="Keep the screen on during sessions"
        description="Only while Pandaro is open and a session is running."
        checked={s.keepAwake}
        onChange={(v) => set({ keepAwake: v })}
      />
    </Section>
  );
}
