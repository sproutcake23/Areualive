// import "../global.css";

// import { useEffect } from "react";
// import { View } from "react-native";
// import { Stack } from "expo-router";
// import { GestureHandlerRootView } from "react-native-gesture-handler";
// import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

// import { SyncStatusBadge } from "@/components/sync/SyncStatusBadge";
// import { useSyncQueue } from "@/hooks/useSyncQueue";
// import { registerBackgroundSync } from "@/lib/backgroundSync";

// export default function RootLayout() {
//   // Drives foreground sync + keeps syncStore (the badge) live. Single instance.
//   useSyncQueue();

//   // Register the background sync task once on startup. Idempotent — safe across
//   // re-launches. See tasks/syncTask.ts and AGENTS.md → Background sync.
//   useEffect(() => {
//     registerBackgroundSync();
//   }, []);

//   return (
//     <GestureHandlerRootView style={{ flex: 1 }}>
//       <SafeAreaProvider>
//         <Stack screenOptions={{ headerShown: false }} />
//         {/* Persistent, always-visible sync status badge (see UI Rules). */}
//         <SafeAreaView
//           edges={["top"]}
//           pointerEvents="box-none"
//           style={{ position: "absolute", top: 0, left: 0, right: 0 }}
//         >
//           <View pointerEvents="box-none" className="flex-row justify-end px-4 pt-2">
//             <SyncStatusBadge />
//           </View>
//         </SafeAreaView>
//       </SafeAreaProvider>
//     </GestureHandlerRootView>
//   );
// }


import "../global.css";

import { Stack } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { initializeBridgeModels } from "@/lib/cameraInterface";
import { useTensorflowModel } from "react-native-fast-tflite";

import { SyncStatusBadge } from "@/components/sync/SyncStatusBadge";
import { useSyncQueue } from "@/hooks/useSyncQueue";
import { registerBackgroundSync } from "@/lib/backgroundSync";
import { Slot } from "expo-router";
import { ModelProvider } from "../context/ModelContext";


export default function RootLayout() {
  // 🔄 Driving foreground sync states
  useSyncQueue();

  // 🔄 BACKGROUND TASK REGISTRATION
  useEffect(() => {
    registerBackgroundSync();
  }, []);

  /* // =============================================================================
  // 🧠 UNCOMMENT THIS CORE BLOCK WHEN READY TO RUN FAST-TFLITE ENGINES GLOBALLY
  // =============================================================================
  const fasPlugin = useTensorflowModel(
    { asset: require("../assets/tflite/minifasnet_float16.tflite") }, []
  );
  
  const faceNetPlugin = useTensorflowModel(
    { asset: require("../assets/tflite/mobilefacenet_float16.tflite") }, []
  );

  useEffect(() => {
    if (fasPlugin.state === "loaded" && faceNetPlugin.state === "loaded") {
      const fasModelInstance = fasPlugin.model;
      const faceNetModelInstance = faceNetPlugin.model;

      if (fasModelInstance && faceNetModelInstance) {
        initializeBridgeModels(fasModelInstance, faceNetModelInstance);
        console.log("🧠 [SUCCESS] Global JSI models bound successfully!");
      }
    }
  }, [fasPlugin.state, faceNetPlugin.state]);
  */

  return (
    
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ModelProvider>
        <Slot />
      </ModelProvider>
      <SafeAreaProvider>
        {/* The navigator runs clean with zero conflicting view layers */}
        <Stack screenOptions={{ headerShown: false }} />
        
        {/* 🎯 FIXED OVERLAY: Replaced SafeAreaView wrapper with a plain absolute View overlay */}
        <View
          pointerEvents="box-none"
          style={{ 
            position: "absolute", 
            top: 12, // Standard safe offset padding parameter
            left: 0, 
            right: 0,
            zIndex: 99999, // Forces the badge to always float cleanly over screen components
          }}
        >
          <View pointerEvents="box-none" className="flex-row justify-end px-4 pt-2">
            <SyncStatusBadge />
          </View>
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}