import { useUi } from '../../state/uiStore';
import { Icon } from '../../ui/components/Icon';
import { NAV } from './nav';

/** Bottom bar in portrait, vertical rail on short landscape screens. */
export function MainNav({ rail }: { rail: boolean }) {
  const view = useUi((s) => s.view);
  const setView = useUi((s) => s.setView);
  return (
    <nav
      aria-label="Main"
      className={
        rail
          ? 'fixed inset-y-0 left-0 z-30 flex w-[76px] flex-col justify-center border-r border-line bg-paper/95 backdrop-blur'
          : 'fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 backdrop-blur'
      }
      style={
        rail
          ? { paddingLeft: 'var(--safe-left)', boxSizing: 'content-box' }
          : { paddingBottom: 'var(--safe-bottom)' }
      }
    >
      <ul
        className={rail ? 'flex flex-col gap-1' : 'mx-auto grid max-w-lg grid-cols-4'}
        style={
          rail ? undefined : { paddingLeft: 'var(--safe-left)', paddingRight: 'var(--safe-right)' }
        }
      >
        {NAV.map((n) => {
          const current = view === n.id;
          return (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => setView(n.id)}
                aria-current={current ? 'page' : undefined}
                className="nav-item flex w-full flex-col items-center gap-0.5 py-2 text-xs font-semibold"
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
  );
}
