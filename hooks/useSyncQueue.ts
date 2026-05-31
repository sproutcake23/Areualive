// Foreground sync orchestration. Watches connectivity, and when the device
// comes online runs the shared sync logic, keeping syncStore (the badge source)
// in step. Background sync is owned separately by tasks/syncTask.ts — this hook
// never duplicates that logic, it only calls syncService.
import { useCallback, useEffect, useRef } from "react";

import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { syncPendingRecords } from "@/lib/syncService";
import { countUnsyncedRecords } from "@/lib/db";
import { useSyncStore } from "@/store/syncStore";

export function useSyncQueue() {
  const isOnline = useNetworkStatus();
  const setStatus = useSyncStore((s) => s.setStatus);
  const setPendingCount = useSyncStore((s) => s.setPendingCount);
  const setLastSyncedAt = useSyncStore((s) => s.setLastSyncedAt);

  // Prevents overlapping runs (e.g. a network blip firing mid-sync).
  const isSyncingRef = useRef(false);

  const runSync = useCallback(async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    setStatus("syncing");
    try {
      const { uploaded, remaining } = await syncPendingRecords();
      setPendingCount(remaining);
      if (uploaded > 0) setLastSyncedAt(new Date().toISOString());
    } finally {
      isSyncingRef.current = false;
      setStatus(isOnline ? "connected" : "offline");
    }
  }, [isOnline, setStatus, setPendingCount, setLastSyncedAt]);

  // Keep the badge's pending count accurate even while offline.
  useEffect(() => {
    if (isOnline) return;
    setStatus("offline");
    countUnsyncedRecords().then(setPendingCount);
  }, [isOnline, setStatus, setPendingCount]);

  // Connectivity restored → drain the queue.
  useEffect(() => {
    if (isOnline) runSync();
  }, [isOnline, runSync]);

  return { runSync };
}
