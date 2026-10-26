import { useUi } from '../../state/uiStore';
import { Modal } from '../../ui/components/Modal';
import { SHORTCUTS } from '../../ui/hooks/useShortcuts';

export function ShortcutsDialog() {
  const open = useUi((s) => s.sheet === 'shortcuts');
  const openSheet = useUi((s) => s.openSheet);
  return (
    <Modal open={open} title="Keyboard shortcuts" onClose={() => openSheet(null)}>
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
  );
}
