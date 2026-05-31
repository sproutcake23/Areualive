import "../global.css";

import { useEffect } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { SyncStatusBadge } from "@/components/sync/SyncStatusBadge";
import { useSyncQueue } from "@/hooks/useSyncQueue";
import { registerBackgroundSync } from "@/lib/backgroundSync";

export default function RootLayout() {
  // Drives foreground sync + keeps syncStore (the badge) live. Single instance.
  useSyncQueue();

  // Register the background sync task once on startup. Idempotent — safe across
  // re-launches. See tasks/syncTask.ts and AGENTS.md → Background sync.
  useEffect(() => {
    registerBackgroundSync();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Stack screenOptions={{ headerShown: false }} />
        {/* Persistent, always-visible sync status badge (see UI Rules). */}
        <SafeAreaView
          edges={["top"]}
          pointerEvents="box-none"
          style={{ position: "absolute", top: 0, left: 0, right: 0 }}
        >
          <View pointerEvents="box-none" className="flex-row justify-end px-4 pt-2">
            <SyncStatusBadge />
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
