// Registration for the background sync task. Importing this module also pulls in
// tasks/syncTask.ts, which runs TaskManager.defineTask as a side-effect — so the
// task is defined before we register it. Call registerBackgroundSync() once at
// app startup. See AGENTS.md → backgroundSync owns all background sync logic.
import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";

import { config } from "@/constants/config";
import { SYNC_TASK_NAME } from "@/tasks/syncTask";

// Idempotent — safe to call on every app launch.
export async function registerBackgroundSync(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(SYNC_TASK_NAME);
  if (isRegistered) return;

  await BackgroundFetch.registerTaskAsync(SYNC_TASK_NAME, {
    // OS may extend this interval; it is never shorter. See constants/config.ts.
    minimumInterval: config.BACKGROUND_SYNC_INTERVAL_SEC,
    stopOnTerminate: false, // keep syncing after the app is swiped away (Android)
    startOnBoot: true, // resume after device reboot (Android)
  });
}

export async function unregisterBackgroundSync(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(SYNC_TASK_NAME);
  if (isRegistered) await BackgroundFetch.unregisterTaskAsync(SYNC_TASK_NAME);
}
