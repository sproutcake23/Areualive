// // Biometric enrollment. Captures the field-person's face and stores their
// // identity + descriptor via authStore (MMKV). Drives capture through the
// // cameraInterface mock until the AI Team's plugin lands.
// //
// // Screen only composes components + calls the store; the enrollment business
// // logic lives behind lib/cameraInterface.ts.
// import { useState } from "react";
// import { Text, TextInput, View, TouchableOpacity } from "react-native";
// import { useSafeAreaInsets } from "react-native-safe-area-context";
// import { router } from "expo-router";
// import * as Crypto from "expo-crypto";
// import { MaterialCommunityIcons } from "@expo/vector-icons";

// import { Button } from "@/components/common/Button";
// import { CameraPreview } from "@/components/camera/CameraPreview";
// import { FaceOverlay } from "@/components/camera/FaceOverlay";
// import { useCameraSession } from "@/hooks/useCameraSession";
// import { mockEnrollFace } from "@/lib/cameraInterface";
// import { useAuthStore } from "@/store/authStore";

// export default function Enrollment() {
//   const { device, hasPermission, isActive } = useCameraSession();
//   const enroll = useAuthStore((s) => s.enroll);
//   const insets = useSafeAreaInsets();
//   const [name, setName] = useState("");
//   const [busy, setBusy] = useState(false);
//   const [showCamera, setShowCamera] = useState(false);

//   const canEnroll = name.trim().length > 0 && !busy;

//   const onCapture = async () => {
//     if (!canEnroll) return;
//     setBusy(true);
//     try {
//       // TODO: AI Team — replace mockEnrollFace() with a captured Frame passed to
//       // enrollFaceFrame() once the Frame Processor Plugin is available.
//       const { faceDescriptor, error } = await mockEnrollFace();
//       if (error) return;
//       enroll(
//         {
//           id: Crypto.randomUUID(),
//           name: name.trim(),
//           enrolledAt: new Date().toISOString(),
//         },
//         faceDescriptor
//       );
//       router.replace("/verify");
//     } finally {
//       setBusy(false);
//     }
//   };

//   if (!showCamera) {
//     return (
//       <View className="flex-1 items-center justify-center bg-[#f0f4f8]">
//         <TouchableOpacity
//           onPress={() => setShowCamera(true)}
//           className="items-center"
//           activeOpacity={0.7}
//         >
//           <View className="mb-4 h-32 w-32 items-center justify-center rounded-3xl bg-white shadow-sm elevation-2">
//             <MaterialCommunityIcons
//               name="account-plus-outline"
//               size={64}
//               color="#0f172a"
//             />
//           </View>
//           <Text className="text-xl font-medium text-slate-800">Add user</Text>
//         </TouchableOpacity>
//       </View>
//     );
//   }

//   return (
//     <View className="flex-1 bg-black">
//       <CameraPreview
//         device={device}
//         hasPermission={hasPermission}
//         isActive={isActive}
//       />
//       <FaceOverlay />
      
//       {/* Absolute top section matching design (arrow + title) */}
//       <View 
//         className="absolute left-0 right-0 z-50 px-6"
//         style={{ top: Math.max(insets.top, 16) + 8 }}
//         pointerEvents="box-none"
//       >
//         <TouchableOpacity
//           onPress={() => {
//             if (!busy) {
//               setShowCamera(false);
//               setName("");
//             }
//           }}
//           disabled={busy}
//           activeOpacity={0.7}
//           hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
//           className="mb-4"
//         >
//           <MaterialCommunityIcons name="arrow-left" size={28} color="white" />
//         </TouchableOpacity>
//         <Text className="text-2xl font-semibold text-white shadow-sm">
//           Face registration
//         </Text>
//       </View>

//       <View className="absolute bottom-0 left-0 right-0 z-50 justify-end gap-4 px-6 pb-8" pointerEvents="box-none" style={{ paddingBottom: Math.max(insets.bottom, 24) }}>
//         <TextInput
//           value={name}
//           onChangeText={setName}
//           placeholder="Your name"
//           placeholderTextColor="#9ca3af"
//           className="rounded-xl bg-neutral-800 px-4 py-3 text-base text-white"
//         />
//         <Button
//           label={busy ? "Enrolling…" : "Registration completed"}
//           onPress={onCapture}
//           disabled={!canEnroll}
//         />
//       </View>
//     </View>
//   );
// }


import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import { router } from "expo-router";
import { useState, useRef, useEffect, useMemo } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFrameProcessor } from "react-native-vision-camera";
import { useFaceDetector } from "react-native-vision-camera-face-detector";
import { useRunOnJS } from "react-native-worklets-core"; // 🎯 FIX: Core threading hook from Reanimated
import { useResizePlugin } from "vision-camera-resize-plugin";

import { CameraPreview } from "@/components/camera/CameraPreview";
import { FaceOverlay } from "@/components/camera/FaceOverlay";
import { Button } from "@/components/common/Button";
import { useCameraSession } from "@/hooks/useCameraSession";
import { enrollFaceFrame } from "@/lib/cameraInterface"; // 🎯 The C++ Bridge file we implemented
import { useAuthStore } from "@/store/authStore";
import { useTensorflowModel } from "react-native-fast-tflite";
import { NitroModules } from 'react-native-nitro-modules'



export default function Enrollment() {
  const { device, hasPermission, isActive } = useCameraSession();
  const enroll = useAuthStore((s) => s.enroll);
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const faceDetector = useFaceDetector({ performanceMode: "fast" });
  const { resize } = useResizePlugin();

  // Shared values used to pass signals safely across native threads
  const shouldCapture = useSharedValue(false);
  const isProcessing = useSharedValue(false);

  const canEnroll = name.trim().length > 0 && !busy;

  console.log("🗄️ [Zustand DB State] Total registered users in memory:", enroll.length, enroll);

// 🎯 ADD THIS LOG HERE TO TRACE THE FREEZE:
console.log(`📊 [Button State Check] Name Length: ${name.trim().length}, Busy: ${busy}, CanEnroll: ${canEnroll}`);

  const faceNetPlugin = useTensorflowModel(
    require("../../assets/tflite/mobilefacenet_float16.tflite"), []);

  const faceNetModel =  faceNetPlugin.state === 'loaded' ? faceNetPlugin.model : undefined;


  const boxedMobileFaceModel = useMemo(
    () => (faceNetModel != null ? NitroModules.box(faceNetModel as any): undefined),
  [faceNetModel]
)


  useEffect(() => {
    if (faceNetPlugin.state === "loaded" && faceNetPlugin.model) {
      console.log("🛡️ [Ref Guard] Nitro C++ engine safely secured inside reference wrapper.");
    }
  }, [faceNetPlugin.state, faceNetPlugin.model]);

  // 🎯 JS Thread Handler: Receives finalized embedding data from the C++ worker thread
  const handleEnrollmentSuccess = useRunOnJS((faceDescriptor: number[]) => {
    try {
      enroll(
        {
          id: Crypto.randomUUID(),
          name: name.trim(),
          enrolledAt: new Date().toISOString(),
        },
        faceDescriptor
      );
      setBusy(false);
      router.replace("/verify");
    } catch (err) {
      setErrorMessage("Failed to commit identity storage.");
      setBusy(false);
    }
  }, [enroll, name]);

  const handleEnrollmentFailure = useRunOnJS((errorText: string) => {
    setErrorMessage(errorText);
    setBusy(false);
  }, []);

  const onCapture = () => {
    // 🎯 FIX: Explicitly check the absolute values directly instead of the reactive state string
    if (name.trim().length === 0 || busy) {
      console.log("⚠️ [Capture Guarded] Cannot enroll. Name empty or system already busy.");
      return;
    }
    
    setErrorMessage(null);
    
    // 🎯 1. Set the Reanimated shared value latch FIRST
    shouldCapture.value = true;
    console.log(`🔘 [UI Latch Set] Gate opened! shouldCapture.value is now: ${shouldCapture.value}`);
    
    // 🎯 2. Turn on the busy loader state last
    setBusy(true);
  };

  // 🎯 LIVE FRAME PROCESSOR WORKLET
  const frameProcessor = useFrameProcessor((frame) => {
    "worklet";
    if (boxedMobileFaceModel == null) return;
    if (!shouldCapture.value) return;
    if (isProcessing.value) return;


    console.log("🎯 [CAPTURE EVENT DETECTED BY WORKLET] -> Gate verified open! Locking thread latches...");
    isProcessing.value = true;
    shouldCapture.value = false; // Close latch immediately

    try {
      const result = enrollFaceFrame({ 
        frame,
        resizePlugin: resize,
        faceDetectorPlugin: faceDetector,
        boxedMobileFaceInterpreter: boxedMobileFaceModel,

      });

      if (result.error || !result.faceDescriptor || result.faceDescriptor.length === 0) {
        isProcessing.value = false;
        handleEnrollmentFailure(result.error || "Vector mapping failed.");
      } else {
        isProcessing.value = false;
        handleEnrollmentSuccess(result.faceDescriptor);
      }
    } catch (err: any) {
      console.log("💥 Worklet execution crash:", err.message);
      isProcessing.value = false;
      handleEnrollmentFailure(err.message || "Native execution exception.");
    }
    // 🎯 CRITICAL FIX: Added hooks and shared values to dependency scope to maintain thread syncing
  }, [faceDetector, resize, shouldCapture, isProcessing, boxedMobileFaceModel]); 

  if (!showCamera) {
    return (
      <View className="flex-1 items-center justify-center bg-[#f0f4f8]">
        <TouchableOpacity
          onPress={() => setShowCamera(true)}
          className="items-center"
          activeOpacity={0.7}
        >
          <View className="mb-4 h-32 w-32 items-center justify-center rounded-3xl bg-white shadow-sm elevation-2">
            <MaterialCommunityIcons name="account-plus-outline" size={64} color="#0f172a" />
          </View>
          <Text className="text-xl font-medium text-slate-800">Add user</Text>
        </TouchableOpacity>
      </View>
    );
  }

return (
    <View className="flex-1 bg-black">
      {/* Camera and Overlays are strictly locked to the back */}
      <View className="absolute inset-0 z-10">
        <CameraPreview
          device={device}
          hasPermission={hasPermission}
          isActive={isActive}
          frameProcessor={frameProcessor} 
        />
        <FaceOverlay />
      </View>
      
      {/* Top Header Panel */}
      <View 
        className="absolute left-0 right-0 z-40 px-6"
        style={{ top: Math.max(insets.top, 16) + 8 }}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          onPress={() => {
            if (!busy) {
              setShowCamera(false);
              setName("");
              setErrorMessage(null);
            }
          }}
          disabled={busy}
          activeOpacity={0.7}
          className="mb-4"
        >
          <MaterialCommunityIcons name="arrow-left" size={28} color="white" />
        </TouchableOpacity>
        <Text className="text-2xl font-semibold text-white shadow-sm">
          Face registration
        </Text>
      </View>

      {/* 🎯 THE CRITICAL FIX: Ultra-isolated bottom panel floating above everything */}
      <View 
        style={{ 
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          paddingHorizontal: 24,
          paddingBottom: Math.max(insets.bottom, 24),
          gap: 16,
          zIndex: 9999, // 🎯 FORCES this layout layer to sit above the camera preview
          elevation: 10, // Android equivalent layer boost
          backgroundColor: 'transparent'
        }}
        pointerEvents="box-none" // Ensures empty spaces pass touches, but children catch them
      >
        {errorMessage && (
          <Text className="text-center text-sm font-semibold text-red-500 bg-black/80 p-3 rounded-lg">
            {errorMessage}
          </Text>
        )}
        
        <TextInput
          value={name}
          onChangeText={setName}
          editable={!busy}
          placeholder="Your name"
          placeholderTextColor="#9ca3af"
          className="rounded-xl bg-neutral-900 px-4 py-3.5 text-base text-white border border-neutral-800 shadow-xl"
          style={{ zIndex: 10000 }} // Ensure text field responds cleanly
        />
        
        {/* 🎯 CRITICAL TOUCH INJECTION: Native button replacement using an explicit Touchable wrapper */}
        <TouchableOpacity 
          onPress={() => {
            console.log("🔘 [HARDWARE TOUCH DETECTED] Register Face button physically clicked!");
            onCapture();
          }}
          disabled={!canEnroll}
          activeOpacity={0.7}
          style={{ 
            zIndex: 10001, // Highest priority element on the coordinate axis
            opacity: canEnroll ? 1 : 0.5 
          }}
        >
          <View className="bg-blue-600 p-4 rounded-xl items-center justify-center shadow-2xl">
            <Text className="text-white text-base font-bold tracking-wide">
              {busy ? "Enrolling…" : "Register Face"}
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

//   return (
//     <View className="flex-1 bg-black">
//       <CameraPreview
//         device={device}
//         hasPermission={hasPermission}
//         isActive={isActive}
//         frameProcessor={frameProcessor} 
//       />
//       <FaceOverlay />
      
//       <View 
//         className="absolute left-0 right-0 z-50 px-6"
//         style={{ top: Math.max(insets.top, 16) + 8 }}
//         pointerEvents="box-none"
//       >
//         <TouchableOpacity
//           onPress={() => {
//             if (!busy) {
//               setShowCamera(false);
//               setName("");
//               setErrorMessage(null);
//             }
//           }}
//           disabled={busy}
//           activeOpacity={0.7}
//           hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
//           className="mb-4"
//         >
//           <MaterialCommunityIcons name="arrow-left" size={28} color="white" />
//         </TouchableOpacity>
//         <Text className="text-2xl font-semibold text-white shadow-sm">
//           Face registration
//         </Text>
//       </View>

//       <View className="absolute bottom-0 left-0 right-0 z-50 justify-end gap-4 px-6 pb-8" pointerEvents="box-none" style={{ paddingBottom: Math.max(insets.bottom, 24) }}>
//         {errorMessage && (
//           <Text className="text-center text-sm font-semibold text-red-500 bg-black/60 p-2 rounded-lg">
//             {errorMessage}
//           </Text>
//         )}
//         <TextInput
//           value={name}
//           onChangeText={setName}
//           editable={!busy}
//           placeholder="Your name"
//           placeholderTextColor="#9ca3af"
//           className="rounded-xl bg-neutral-800 px-4 py-3 text-base text-white"
//         />
//         <Button
//           label={busy ? "Enrolling…" : "Register Face"}
//           onPress={onCapture}
//           disabled={!canEnroll}
//         />
//       </View>
//     </View>
//   );
// }