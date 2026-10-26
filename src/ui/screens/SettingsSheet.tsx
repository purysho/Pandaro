import { useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { canInstall, onInstallChange, promptInstall } from '../../app/pwa';
import { parseBackup, previewImport, type ImportPreview } from '../../persistence/backup';
import type { Backup, Settings } from '../../persistence/schema';
import { chime } from '../../platform/audio/chime';
import { isNative, notifications } from '../../platform';
import { applyTheme } from '../../state/engine';
import { deleteAllData, exportData, importData } from '../../state/dataOps';
import { useHistory } from '../../state/historyStore';
import { PRESETS, useSettings } from '../../state/settingsStore';
import { useTimer } from '../../state/timerStore';
import { useUi } from '../../state/uiStore';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';

type Patch = Partial<Omit<Settings, 'v'>>;

function useSetting() {
  const update = useSettings((s) => s.update);
  return (patch: Patch) => {
    update(patch);
    useTimer.getState().applySettings();
    if ('theme' in patch || 'reduceMotion' in patch) applyTheme();
  };
}

export function SettingsSheet() {
  const open = useUi((s) => s.sheet === 'settings');
  const openSheet = useUi((s) => s.openSheet);
  return (
    <Modal open={open} title="Settings" onClose={() => openSheet(null)} variant="sheet" wide>
      <div className="flex flex-col gap-6">
        <TimerSection />
        <BehaviourSection />
        <SoundSection />
        <NotificationSection />
        <DisplaySection />
        <DataSection />
        <AboutSection />
      </div>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="eyebrow">{title}</h3>
      {children}
    </section>
  );
}

function Toggle({
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

function NumberField({
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

function TimerSection() {
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

function BehaviourSection() {
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

function SoundSection() {
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

function NotificationSection() {
  const on = useSettings((x) => x.settings.notifications);
  const set = useSetting();
  const toast = useUi((x) => x.toast);
  async function change(next: boolean) {
    if (!next) return set({ notifications: false });
    const port = await notifications();
    const state = await port.request();
    if (state === 'granted') {
      set({ notifications: true });
    } else if (state === 'unsupported') {
      toast('Notifications aren’t supported here. The chime still plays while Pandaro is open.');
    } else {
      toast(
        'Notifications are blocked. Allow them for Pandaro in your browser or system settings, then try again.',
      );
    }
  }
  return (
    <Section title="Notifications">
      <Toggle
        label="Notify me when a session ends"
        description={
          isNative
            ? 'Works even when Pandaro is in the background. Delivery can be delayed by a few minutes by battery saving.'
            : 'Works while Pandaro is open in a tab, including background tabs. Browsers can’t notify after the tab is closed.'
        }
        checked={on}
        onChange={(v) => void change(v)}
      />
    </Section>
  );
}

function DisplaySection() {
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

function DataSection() {
  const sessions = useHistory((x) => x.sessions);
  const toast = useUi((x) => x.toast);
  const file = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ backup: Backup; preview: ImportPreview } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typed, setTyped] = useState('');

  async function onFile(f: File | undefined) {
    setError(null);
    if (!f) return;
    const result = parseBackup(await f.text());
    if (!result.ok) return setError(result.error);
    setPending({ backup: result.backup, preview: previewImport(result.backup, sessions) });
  }

  async function apply(mode: 'merge' | 'replace') {
    if (!pending) return;
    try {
      const undo = await importData(pending.backup, mode);
      setPending(null);
      toast(
        mode === 'merge' ? 'Backup merged' : 'Data replaced from backup',
        { label: 'Undo', run: () => void undo() },
        10_000,
      );
    } catch {
      setError('The import could not be saved. Your existing data is unchanged.');
    }
  }

  return (
    <Section title="Your data">
      <p className="text-sm text-muted">
        Everything stays on this device. Export a backup to move it or keep it safe.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() =>
            void exportData()
              .then((how) => toast(how === 'saved' ? 'Backup downloaded' : 'Backup ready to save'))
              .catch(() => toast('Export failed. Try again.'))
          }
        >
          <Icon name="download" size={18} /> Export backup
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => file.current?.click()}>
          <Icon name="upload" size={18} /> Import backup
        </button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          aria-label="Choose a backup file"
          tabIndex={-1}
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {pending && (
        <div
          className="rounded-2xl border-[1.5px] border-line p-3 text-sm"
          role="region"
          aria-label="Import preview"
        >
          <p className="font-semibold">
            Backup from {new Date(pending.preview.exportedAt).toLocaleString()}
          </p>
          <p className="text-muted">
            {pending.preview.tasks} tasks, {pending.preview.sessions} sessions (
            {pending.preview.newSessions} new).
          </p>
          <p className="mt-2 text-muted">
            Merge adds what is missing and keeps your settings. Replace swaps all tasks, history and
            settings for the backup. You can undo either for a few seconds.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={() => void apply('merge')}>
              Merge
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => void apply('replace')}>
              Replace
            </button>
            <button type="button" className="btn" onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <button
        type="button"
        className="btn self-start text-danger"
        onClick={() => setConfirmDelete(true)}
      >
        <Icon name="trash" size={18} /> Delete all data
      </button>
      <Modal open={confirmDelete} title="Delete all data?" onClose={() => setConfirmDelete(false)}>
        <p className="text-muted">
          This removes every task, session, setting and your garden from this device. It can’t be
          undone. Export a backup first if you might want it later.
        </p>
        <label htmlFor="delete-confirm" className="mt-4 block text-sm font-semibold">
          Type DELETE to confirm
        </label>
        <input
          id="delete-confirm"
          className="field mt-1"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={typed.trim().toUpperCase() !== 'DELETE'}
            onClick={() => void deleteAllData().then(() => window.location.reload())}
          >
            Delete everything
          </button>
        </div>
      </Modal>
    </Section>
  );
}

function InstallHint() {
  const installable = useSyncExternalStore(onInstallChange, canInstall, () => false);
  const standalone =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true);
  if (isNative || standalone) return null;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  if (installable) {
    return (
      <button
        type="button"
        className="btn btn-ghost self-start"
        onClick={() => void promptInstall()}
      >
        <Icon name="download" size={18} /> Install Pandaro as an app
      </button>
    );
  }
  return (
    <p className="text-sm text-muted">
      {ios
        ? 'To install on iPhone or iPad: open Pandaro in Safari, tap Share, then “Add to Home Screen”.'
        : 'You can install Pandaro from your browser’s menu (“Install app” or “Add to Home screen”) to use it like a regular app, even offline.'}
    </p>
  );
}

function Notices() {
  const [text, setText] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn btn-ghost self-start"
        onClick={() => {
          setOpen(true);
          if (text === null) {
            void fetch(`${import.meta.env.BASE_URL}third-party-notices.txt`)
              .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
              .then(setText)
              .catch(() =>
                setText(
                  'The licence list could not be loaded. It is in THIRD_PARTY_NOTICES.md in the source code.',
                ),
              );
          }
        }}
      >
        Open-source licences
      </button>
      <Modal open={open} title="Open-source licences" onClose={() => setOpen(false)} wide>
        <pre className="text-xs whitespace-pre-wrap text-muted">{text ?? 'Loading…'}</pre>
      </Modal>
    </>
  );
}

function AboutSection() {
  const openSheet = useUi((s) => s.openSheet);
  return (
    <Section title="About">
      <InstallHint />
      <p className="text-sm text-muted">
        Pandaro {__APP_VERSION__}. No account, no ads, no tracking. Your data never leaves this
        device unless you export it.
      </p>
      <button
        type="button"
        className="btn btn-ghost self-start"
        onClick={() => openSheet('shortcuts')}
      >
        <Icon name="keyboard" size={18} /> Keyboard shortcuts
      </button>
      <Notices />
    </Section>
  );
}
