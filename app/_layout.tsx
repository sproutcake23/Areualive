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


// import "../global.css";

// import { Stack } from "expo-router";
// import { useEffect } from "react";
// import { GestureHandlerRootView } from "react-native-gesture-handler";
// import { SafeAreaProvider } from "react-native-safe-area-context";
// import { View, ActivityIndicator, Text } from "react-native";

// import { SyncStatusBadge } from "@/components/sync/SyncStatusBadge";
// import { useSyncQueue } from "@/hooks/useSyncQueue";
// import { registerBackgroundSync } from "@/lib/backgroundSync";
// import { ModelProvider, useGlobalModels } from "../context/ModelContext"; 

// // =============================================================================
// // 1️⃣ ISOLATED NAVIGATION DECK SUB-COMPONENT
// // =============================================================================
// function NavigationStack() {
//   const { isModelLoaded } = useGlobalModels();

//   // Block UI thread routing safely while the 16MB TFLite binaries load into hardware RAM
//   if (!isModelLoaded) {
//     return (
//       <View className="flex-1 bg-slate-950 justify-center items-center gap-4">
//         <ActivityIndicator size="large" color="#f59e0b" />
//         <Text className="text-slate-400 text-xs font-mono tracking-widest uppercase">
//           Initializing Biometric AI Core...
//         </Text>
//       </View>
//     );
//   }

//   // Once initialized, this mounts exactly ONCE and stays stable across runtime checks
//   return (
//     <Stack screenOptions={{ headerShown: false }}>
//       <Stack.Screen name="index" />
//       <Stack.Screen name="enrollment" />
//       <Stack.Screen name="verify" />
//     </Stack>
//   );
// }

// // =============================================================================
// // 2️⃣ MASTER APP ROOT LAYOUT ENTRY POINT
// // =============================================================================
// export default function RootLayout() {
//   // 🔄 Driving automated local db foreground synchronization queue channels
//   useSyncQueue();

//   // 🔄 BACKGROUND TASK SYNCHRONIZATION REGISTRATION
//   useEffect(() => {
//     registerBackgroundSync();
//   }, []);

//   return (
//     <GestureHandlerRootView style={{ flex: 1 }}>
//       <ModelProvider>
//         <SafeAreaProvider>
          
//           {/* 🎯 STEP 1: Render the single, safe loading-gated navigation stack */}
//           <NavigationStack />
          
//           {/* 🎯 STEP 2: Render your global absolute overlay right on top of it */}
//           <View
//             pointerEvents="box-none"
//             style={{ 
//               position: "absolute", 
//               top: 12, 
//               left: 0, 
//               right: 0,
//               zIndex: 99999, // Guarantees the status badge floats crisp over video frames
//             }}
//           >
//             <View pointerEvents="box-none" className="flex-row justify-end px-4 pt-2">
//               <SyncStatusBadge />
//             </View>
//           </View>

//         </SafeAreaProvider>
//       </ModelProvider>
//     </GestureHandlerRootView>
//   );
// }

import "../global.css";

import { Stack } from "expo-router";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { View, ActivityIndicator, Text } from "react-native";

import { SyncStatusBadge } from "@/components/sync/SyncStatusBadge";
import { useSyncQueue } from "@/hooks/useSyncQueue";
import { registerBackgroundSync } from "@/lib/backgroundSync";

// 🎯 Ensure this path safely references your newly moved context folder outside app/
import { ModelProvider, useGlobalModels } from "../context/ModelContext"; 

// =============================================================================
// 🧠 1. APP INITIALIZATION ENGINE GATEKEEPER
// =============================================================================
function AppGatekeeper() {
  const { isModelLoaded } = useGlobalModels();

  // If the 16MB neural network weights are still loading into RAM, show a splash loader
  if (!isModelLoaded) {
    return (
      <View className="flex-1 bg-slate-950 justify-center items-center gap-4">
        <ActivityIndicator size="large" color="#f59e0b" />
        <Text className="text-slate-400 text-xs font-mono tracking-widest uppercase">
          Initializing Biometric AI Core...
        </Text>
      </View>
    );
  }

  // Once model flips to loaded, render the true navigational structure.
  // 🎯 FIX: We updated the enrollment route location to match your folder group!
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)/enrollment" /> 
      <Stack.Screen name="verify" />
    </Stack>
  );
}

// =============================================================================
// 🌟 2. MASTER ROOT LAYOUT (The Single Mandatory Default Export)
// =============================================================================
export default function RootLayout() {
  // 🔄 Driving automated local db foreground synchronization queue channels
  useSyncQueue();

  // 🔄 BACKGROUND TASK SYNCHRONIZATION REGISTRATION
  useEffect(() => {
    registerBackgroundSync();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ModelProvider>
        <SafeAreaProvider>
          
          {/* Render our safe initialization gate right here */}
          <AppGatekeeper />
          
          {/* Global absolute floating sync badge overlay */}
          <View
            pointerEvents="box-none"
            style={{ 
              position: "absolute", 
              top: 12, 
              left: 0, 
              right: 0,
              zIndex: 99999,
            }}
          >
            <View pointerEvents="box-none" className="flex-row justify-end px-4 pt-2">
              <SyncStatusBadge />
            </View>
          </View>

        </SafeAreaProvider>
      </ModelProvider>
    </GestureHandlerRootView>
  );
}