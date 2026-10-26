import { useUi, type View } from '../../state/uiStore';
import { Icon } from '../../ui/components/Icon';
import { NAV } from './nav';

/** Desktop tabs for the panel beside the timer. */
export function SectionTabs({ current }: { current: View }) {
  const setView = useUi((s) => s.setView);
  return (
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
          aria-selected={current === n.id}
          className="chip"
          onClick={() => setView(n.id)}
        >
          <Icon name={n.icon} size={18} />
          {n.label}
        </button>
      ))}
    </div>
  );
}
