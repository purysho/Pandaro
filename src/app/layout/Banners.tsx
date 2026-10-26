import { useUi } from '../../state/uiStore';

export function Banners() {
  const storageWarning = useUi((s) => s.storageWarning);
  const updateReady = useUi((s) => s.updateReady);
  if (!storageWarning && !updateReady) return null;
  return (
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
          This browser is not saving Pandaro’s data (private mode or blocked storage). Everything
          works, but it will be gone when you close the tab.
        </div>
      )}
    </div>
  );
}
