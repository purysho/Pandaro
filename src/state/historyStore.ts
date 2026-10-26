import { create } from 'zustand';
import type { SessionRecord } from '../domain/timer/types';

interface HistoryState {
  sessions: SessionRecord[];
  add(record: SessionRecord): void;
  replace(sessions: SessionRecord[]): void;
}

export const useHistory = create<HistoryState>((set) => ({
  sessions: [],
  add: (record) =>
    set((s) =>
      s.sessions.some((x) => x.id === record.id) ? s : { sessions: [...s.sessions, record] },
    ),
  replace: (sessions) => set({ sessions }),
}));
