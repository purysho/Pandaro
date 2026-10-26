import { useEffect } from 'react';
import { useUi, type Toast } from '../../state/uiStore';

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useUi((s) => s.dismissToast);
  useEffect(() => {
    const t = window.setTimeout(() => dismiss(toast.id), toast.timeoutMs);
    return () => window.clearTimeout(t);
  }, [toast.id, toast.timeoutMs, dismiss]);
  return (
    <div className="bubble-in pointer-events-auto flex items-center gap-3 rounded-2xl bg-ink px-4 py-2.5 text-paper shadow-lg">
      <span className="flex-1 text-sm">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          className="rounded-full px-2 py-1 text-sm font-bold underline underline-offset-2"
          onClick={() => {
            toast.action?.run();
            dismiss(toast.id);
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        className="text-sm opacity-70"
        aria-label="Dismiss"
        onClick={() => dismiss(toast.id)}
      >
        ✕
      </button>
    </div>
  );
}

export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-40 flex flex-col items-center gap-2 px-4"
      style={{ bottom: 'calc(var(--toast-offset, 5.5rem) + var(--safe-bottom))' }}
    >
      {toasts.map((t) => (
        <div key={t.id} className="w-full max-w-md">
          <ToastItem toast={t} />
        </div>
      ))}
    </div>
  );
}

/** Polite announcements for state changes (start, pause, completion). Never ticks every second. */
export function LiveRegion() {
  const announce = useUi((s) => s.announce);
  return (
    <div className="sr-only" aria-live="polite" aria-atomic="true">
      {announce}
    </div>
  );
}
