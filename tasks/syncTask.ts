// Background sync task. Defined once at module load (the import side-effect of
// TaskManager.defineTask registers it). Pull this module in at app startup via
// lib/backgroundSync.ts so the definition exists before registration.
//
// This task reuses the SAME sync logic as the foreground path (syncService).
// It does not re-implement upload/purge. See AGENTS.md → Sync/Purge Flow.
import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";
import NetInfo from "@react-native-community/netinfo";

import { syncPendingRecords } from "@/lib/syncService";
import { countUnsyncedRecords } from "@/lib/db";

export const SYNC_TASK_NAME = "datalake-background-sync";

TaskManager.defineTask(SYNC_TASK_NAME, async () => {
  try {
    // One-shot connectivity check (no listener in a short-lived task).
    const net = await NetInfo.fetch();
    const isOnline = Boolean(net.isConnected && net.isInternetReachable);
    if (!isOnline) return BackgroundFetch.BackgroundFetchResult.NoData;

    const pending = await countUnsyncedRecords();
    if (pending === 0) return BackgroundFetch.BackgroundFetchResult.NoData;

    const { uploaded } = await syncPendingRecords();
    return uploaded > 0
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});
