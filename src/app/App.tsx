import { useSyncExternalStore } from 'react';
import { useSettings, resolvedTheme } from '../state/settingsStore';
import { useTimer } from '../state/timerStore';
import { useUi, type View } from '../state/uiStore';
import { Icon, type IconName } from '../ui/components/Icon';
import { Logo } from '../ui/components/Logo';
import { Modal } from '../ui/components/Modal';
import { Onboarding } from '../ui/components/Onboarding';
import { LiveRegion, Toasts } from '../ui/components/Toasts';
import { useMediaQuery } from '../ui/hooks/useMediaQuery';
import { SHORTCUTS, toggleTheme, useShortcuts } from '../ui/hooks/useShortcuts';
import { GardenPanel } from '../ui/screens/GardenPanel';
import { SettingsSheet } from '../ui/screens/SettingsSheet';
import { StatsPanel } from '../ui/screens/StatsPanel';
import { TasksPanel } from '../ui/screens/TasksPanel';
import { TimerPanel } from '../ui/screens/TimerPanel';
import { canInstall, onInstallChange, promptInstall } from './pwa';

const NAV: { id: View; label: string; icon: IconName }[] = [
  { id: 'timer', label: 'Timer', icon: 'timer' },
  { id: 'tasks', label: 'Tasks', icon: 'list' },
  { id: 'stats', label: 'Stats', icon: 'chart' },
  { id: 'garden', label: 'Garden', icon: 'leaf' },
];

function SidePanel({ view }: { view: View }) {
  if (view === 'stats') return <StatsPanel />;
  if (view === 'garden') return <GardenPanel />;
  return <TasksPanel />;
}

function useInstallable(): boolean {
  return useSyncExternalStore(onInstallChange, canInstall, () => false);
}

export function App() {
  useShortcuts();
  const view = useUi((s) => s.view);
  const setView = useUi((s) => s.setView);
  const sheet = useUi((s) => s.sheet);
  const openSheet = useUi((s) => s.openSheet);
  const storageWarning = useUi((s) => s.storageWarning);
  const updateReady = useUi((s) => s.updateReady);
  const theme = useSettings((s) => s.settings.theme);
  const focusMode = useSettings((s) => s.settings.focusMode);
  const running = useTimer((s) => s.timer.status === 'running');
  const kind = useTimer((s) => s.timer.kind);
  const installable = useInstallable();
  const wide = useMediaQuery('(min-width: 1024px)');
  const dark = resolvedTheme(theme) === 'dark';
  const hideSecondary = focusMode && running;
  const sideView: View = view === 'timer' ? 'tasks' : view;

  return (
    <div className="flex min-h-dvh flex-col" data-kind={kind}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-surface focus:px-4 focus:py-2"
      >
        Skip to timer
      </a>
      <header
        className="sticky top-0 z-30 bg-paper/90 backdrop-blur"
        style={{ paddingTop: 'var(--safe-top)' }}
      >
        <div
          className="mx-auto flex max-w-6xl items-center gap-2 py-2"
          style={{
            paddingLeft: 'max(16px, var(--safe-left))',
            paddingRight: 'max(16px, var(--safe-right))',
          }}
        >
          <Logo />
          <span className="flex-1" />
          {installable && (
            <button
              type="button"
              className="btn btn-ghost hidden h-10 text-sm sm:inline-flex"
              onClick={() => void promptInstall()}
            >
              Install app
            </button>
          )}
          <button
            type="button"
            className="icon-btn"
            onClick={toggleTheme}
            aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
            title="Theme (T)"
          >
            <Icon name={dark ? 'sun' : 'moon'} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => openSheet('settings')}
            aria-label="Settings"
          >
            <Icon name="settings" />
          </button>
        </div>
        {(storageWarning || updateReady) && (
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 pb-2">
            {updateReady && (
              <div
                role="status"
                className="flex items-center gap-3 rounded-2xl bg-accent-soft px-4 py-2 text-sm"
              >
                <span className="flex-1">A new version of Pandaro is ready.</span>
                <button type="button" className="font-bold underline" onClick={updateReady}>
                  Reload
                </button>
              </div>
            )}
            {storageWarning && (
              <div role="alert" className="rounded-2xl bg-surface-2 px-4 py-2 text-sm">
                This browser is not saving Pandaro’s data (private mode or blocked storage).
                Everything works, but it will be gone when you close the tab.
              </div>
            )}
          </div>
        )}
      </header>

      <main
        id="main"
        className="mx-auto w-full max-w-6xl flex-1 pt-2 pb-28 lg:pb-10"
        style={{
          paddingLeft: 'max(16px, var(--safe-left))',
          paddingRight: 'max(16px, var(--safe-right))',
        }}
      >
        {!wide ? (
          // Phones and tablets: one view at a time.
          view === 'timer' || hideSecondary ? (
            <div className="mx-auto max-w-lg">
              <TimerPanel />
            </div>
          ) : (
            <div className="mx-auto max-w-2xl">
              <SidePanel view={view} />
            </div>
          )
        ) : (
          // Desktop: timer beside the secondary panel.
          <div
            className={`grid gap-8 ${hideSecondary ? 'grid-cols-1' : 'grid-cols-[minmax(380px,460px)_1fr]'}`}
          >
            <div
              className={`sticky top-20 self-start ${hideSecondary ? 'mx-auto w-full max-w-lg' : ''}`}
            >
              <TimerPanel compact />
            </div>
            {!hideSecondary && (
              <div className="flex min-w-0 flex-col gap-4">
                <div
                  role="tablist"
                  aria-label="Sections"
                  className="flex self-start rounded-full bg-surface-2 p-1"
                >
                  {NAV.filter((n) => n.id !== 'timer').map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      role="tab"
                      aria-selected={sideView === n.id}
                      className="chip"
                      onClick={() => setView(n.id)}
                    >
                      <Icon name={n.icon} size={18} />
                      {n.label}
                    </button>
                  ))}
                </div>
                <SidePanel view={sideView} />
              </div>
            )}
          </div>
        )}
      </main>

      {!hideSecondary && !wide && (
        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 backdrop-blur lg:hidden"
          style={{ paddingBottom: 'var(--safe-bottom)' }}
        >
          <ul
            className="mx-auto grid max-w-lg grid-cols-4"
            style={{ paddingLeft: 'var(--safe-left)', paddingRight: 'var(--safe-right)' }}
          >
            {NAV.map((n) => {
              const current = view === n.id;
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => setView(n.id)}
                    aria-current={current ? 'page' : undefined}
                    className="flex w-full flex-col items-center gap-0.5 py-2 text-xs font-semibold"
                    style={{ color: current ? 'var(--focus)' : 'var(--ink-muted)' }}
                  >
                    <Icon name={n.icon} />
                    {n.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      <SettingsSheet />
      <Modal
        open={sheet === 'shortcuts'}
        title="Keyboard shortcuts"
        onClose={() => openSheet(null)}
      >
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          {SHORTCUTS.map((s) => (
            <div key={s.keys} className="contents">
              <dt>
                <kbd className="rounded-lg border border-line bg-surface-2 px-2 py-0.5 font-mono text-sm">
                  {s.keys}
                </kbd>
              </dt>
              <dd className="text-muted">{s.action}</dd>
            </div>
          ))}
        </dl>
      </Modal>
      <Onboarding />
      <Toasts />
      <LiveRegion />
    </div>
  );
}
