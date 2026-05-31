// Sync queue status: pending count, last sync time, current status.
// Persisted via MMKV. See AGENTS.md → State Rules.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { mmkvStorage } from "@/lib/storage";
import type { SyncStatus } from "@/types";

type SyncState = {
  status: SyncStatus;
  pendingCount: number;
  lastSyncedAt: string | null;
  setStatus: (status: SyncStatus) => void;
  setPendingCount: (pendingCount: number) => void;
  setLastSyncedAt: (lastSyncedAt: string) => void;
};

export const useSyncStore = create<SyncState>()(
  persist(
    (set) => ({
      status: "offline",
      pendingCount: 0,
      lastSyncedAt: null,
      setStatus: (status) => set({ status }),
      setPendingCount: (pendingCount) => set({ pendingCount }),
      setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
    }),
    {
      name: "sync-store",
      storage: createJSONStorage(() => mmkvStorage),
    }
  )
);
