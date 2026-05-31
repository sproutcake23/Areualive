// Persistent sync status badge. Always visible per AGENTS.md → UI Rules:
// shows connected / offline / syncing and the pending-record count.
//
// Reads syncStore only — it never triggers sync itself. Mount useSyncQueue once
// near the app root to keep this state live.
import { Text, View } from "react-native";

import { useSyncStore } from "@/store/syncStore";
import type { SyncStatus } from "@/types";

const STATUS_STYLES: Record<
  SyncStatus,
  { dot: string; label: string }
> = {
  connected: { dot: "bg-green-400", label: "Connected" },
  syncing: { dot: "bg-amber-400", label: "Syncing…" },
  offline: { dot: "bg-red-400", label: "Offline" },
};

export function SyncStatusBadge() {
  const status = useSyncStore((s) => s.status);
  const pendingCount = useSyncStore((s) => s.pendingCount);

  const { dot, label } = STATUS_STYLES[status];

  return (
    <View className="flex-row items-center gap-2 self-start rounded-full bg-neutral-800 px-3 py-1.5">
      <View className={`h-2.5 w-2.5 rounded-full ${dot}`} />
      <Text className="text-sm font-medium text-neutral-100">{label}</Text>
      {pendingCount > 0 && (
        <Text className="text-sm text-neutral-400">
          {pendingCount} pending
        </Text>
      )}
    </View>
  );
}
