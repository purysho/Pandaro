import type { CSSProperties } from 'react';
import { useSettings } from '../state/settingsStore';
import { useTimer } from '../state/timerStore';
import { useUi, type View } from '../state/uiStore';
import { Onboarding } from '../ui/components/Onboarding';
import { LiveRegion, Toasts } from '../ui/components/Toasts';
import { GardenPanel } from '../ui/garden/GardenPanel';
import { useMediaQuery } from '../ui/hooks/useMediaQuery';
import { useShortcuts } from '../ui/hooks/useShortcuts';
import { SettingsSheet } from '../ui/settings/SettingsSheet';
import { StatsPanel } from '../ui/stats/StatsPanel';
import { TasksPanel } from '../ui/tasks/TasksPanel';
import { TimerPanel } from '../ui/timer/TimerPanel';
import { Header } from './layout/Header';
import { MainNav } from './layout/MainNav';
import { SHORT_LANDSCAPE_QUERY, WIDE_QUERY } from './layout/nav';
import { SectionTabs } from './layout/SectionTabs';
import { ShortcutsDialog } from './layout/ShortcutsDialog';

function SidePanel({ view }: { view: View }) {
  if (view === 'stats') return <StatsPanel />;
  if (view === 'garden') return <GardenPanel />;
  return <TasksPanel />;
}

export function App() {
  useShortcuts();
  const view = useUi((s) => s.view);
  const focusMode = useSettings((s) => s.settings.focusMode);
  const running = useTimer((s) => s.timer.status === 'running');
  const kind = useTimer((s) => s.timer.kind);
  const wide = useMediaQuery(WIDE_QUERY);
  const shortLandscape = useMediaQuery(SHORT_LANDSCAPE_QUERY);
  const hideSecondary = focusMode && running;
  const showNav = !hideSecondary && !wide;
  const rail = showNav && shortLandscape;
  const sideView: View = view === 'timer' ? 'tasks' : view;

  const shellStyle = {
    '--toast-offset': showNav && !rail ? '5.5rem' : '1rem',
    '--rail-width': rail ? '76px' : '0px',
  } as CSSProperties;

  return (
    <div
      className="flex min-h-dvh flex-col"
      data-kind={kind}
      data-layout={wide ? 'wide' : rail ? 'rail' : 'stacked'}
      style={shellStyle}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-surface focus:px-4 focus:py-2"
      >
        Skip to timer
      </a>
      <div style={{ paddingLeft: 'var(--rail-width)' }}>
        <Header compact={shortLandscape} />
      </div>

      <main
        id="main"
        className={`mx-auto w-full max-w-6xl flex-1 pt-2 ${showNav && !rail ? 'pb-28' : 'pb-10'}`}
        style={{
          paddingLeft: 'calc(var(--rail-width) + max(16px, var(--safe-left)))',
          paddingRight: 'max(16px, var(--safe-right))',
        }}
      >
        <div key={wide ? 'wide' : view} className="view-enter">
          {!wide ? (
            view === 'timer' || hideSecondary ? (
              <div className="timer-wrap mx-auto max-w-lg">
                <TimerPanel />
              </div>
            ) : (
              <div className="side-wrap mx-auto max-w-2xl">
                <SidePanel view={view} />
              </div>
            )
          ) : (
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
                  <SectionTabs current={sideView} />
                  <div key={sideView} className="view-enter">
                    <SidePanel view={sideView} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {showNav && <MainNav rail={rail} />}

      <SettingsSheet />
      <ShortcutsDialog />
      <Onboarding />
      <Toasts />
      <LiveRegion />
    </div>
  );
}
