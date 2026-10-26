import { useSyncExternalStore } from 'react';
import { resolvedTheme, useSettings } from '../../state/settingsStore';
import { useUi } from '../../state/uiStore';
import { Icon } from '../../ui/components/Icon';
import { Logo } from '../../ui/components/Logo';
import { toggleTheme } from '../../ui/hooks/useShortcuts';
import { canInstall, onInstallChange, promptInstall } from '../pwa';
import { Banners } from './Banners';

export function Header({ compact }: { compact: boolean }) {
  const theme = useSettings((s) => s.settings.theme);
  const openSheet = useUi((s) => s.openSheet);
  const installable = useSyncExternalStore(onInstallChange, canInstall, () => false);
  const dark = resolvedTheme(theme) === 'dark';

  return (
    <header
      className="sticky top-0 z-30 bg-paper/90 backdrop-blur"
      style={{ paddingTop: 'var(--safe-top)' }}
    >
      <div
        className={`mx-auto flex max-w-6xl items-center gap-2 ${compact ? 'py-0.5' : 'py-2'}`}
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
      <Banners />
    </header>
  );
}
