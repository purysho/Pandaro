import { create } from 'zustand';

export type View = 'timer' | 'tasks' | 'stats' | 'garden';
export type Sheet = 'settings' | 'shortcuts' | null;
export type Celebration = 'session' | 'cycle' | 'break-over';

export interface Toast {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
  timeoutMs: number;
}

interface UiState {
  view: View;
  sheet: Sheet;
  toasts: Toast[];
  celebration: { kind: Celebration; nonce: number; at: number } | null;
  storageWarning: boolean;
  updateReady: (() => void) | null;
  announce: string;
  setView(view: View): void;
  openSheet(sheet: Sheet): void;
  toast(message: string, action?: Toast['action'], timeoutMs?: number): number;
  dismissToast(id: number): void;
  celebrate(kind: Celebration): void;
  setStorageWarning(on: boolean): void;
  setUpdateReady(fn: (() => void) | null): void;
  say(message: string): void;
}

let toastSeq = 0;

export const useUi = create<UiState>((set) => ({
  view: 'timer',
  sheet: null,
  toasts: [],
  celebration: null,
  storageWarning: false,
  updateReady: null,
  announce: '',
  setView: (view) => set({ view }),
  openSheet: (sheet) => set({ sheet }),
  toast: (message, action, timeoutMs = 6000) => {
    const id = ++toastSeq;
    const toast: Toast = action ? { id, message, action, timeoutMs } : { id, message, timeoutMs };
    set((s) => ({ toasts: [...s.toasts.slice(-2), toast] }));
    return id;
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  celebrate: (kind) =>
    set((s) => ({ celebration: { kind, nonce: (s.celebration?.nonce ?? 0) + 1, at: Date.now() } })),
  setStorageWarning: (storageWarning) => set({ storageWarning }),
  setUpdateReady: (updateReady) => set({ updateReady }),
  say: (announce) => set({ announce }),
}));
