import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFrameProcessor } from "react-native-vision-camera";
import { useFaceDetector } from "react-native-vision-camera-face-detector";
import { useRunOnJS } from "react-native-worklets-core";
import { useResizePlugin } from "vision-camera-resize-plugin";

import { CameraPreview } from "@/components/camera/CameraPreview";
import { FaceOverlay } from "@/components/camera/FaceOverlay";
import { LivenessPrompts } from "@/components/camera/LivenessPrompts";
import { Button } from "@/components/common/Button";
import { config } from "@/constants/config";
import { useCameraSession } from "@/hooks/useCameraSession";
import { verifyFaceFrame } from "@/lib/cameraInterface"; // 🎯 The C++ Bridge file we implemented
import { useAuthStore } from "@/store/authStore";
import type { LivenessStep } from "@/types";
import { useTensorflowModel } from "react-native-fast-tflite";
import { NitroModules } from "react-native-nitro-modules";

type Outcome = "idle" | "verifying" | "success" | "failed";

const OUTCOME_MESSAGE: Record<Outcome, string> = {
  idle: "Position your face in the frame, then verify.",
  verifying: "Running real-time AI verification…",
  success: "Attendance recorded successfully.",
  failed: "Verification failed. Unknown profile or spoof detected.",
};

export default function Verify() {
  const { device, hasPermission, isActive } = useCameraSession();
  const user = useAuthStore((s) => s.user);
  const faceDescriptor = useAuthStore((s) => s.faceDescriptor);
  const isEnrolled = useAuthStore((s) => s.isEnrolled);

  const insets = useSafeAreaInsets();
  const detectFaces = useFaceDetector({ performanceMode: "fast" });
  const { resize } = useResizePlugin();

  useEffect(() => {
      console.log(
        "🗄️ [Store Wakeup Check]",
        "\n  ├─ Is User Registered Natively:", isEnrolled,
        "\n  ├─ Identity Name:", user?.name || "None",
        "\n  └─ Biometric Vector Matrix Online:", faceDescriptor ? `${faceDescriptor.length} channels` : "Offline"
      );
    }, [user, faceDescriptor, isEnrolled]);

  
  const [outcome, setOutcome] = useState<Outcome>("idle");
  const [step, setStep] = useState<LivenessStep>(config.LIVENESS_STEPS[0]);
  const [showCamera, setShowCamera] = useState(false);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);

  // Shared variables to drive thread state synchronously
  const isCheckingFrame = useSharedValue(false);
  const triggerInference = useSharedValue(false);
  const activeChallenge = useSharedValue<"blink" | "smile" | "turn">("blink");
  
  const AntiSpoofPlugin = useTensorflowModel(
    require("../assets/tflite/minifasnet_float16.tflite"), []);


  const AntiSpoofModel =  AntiSpoofPlugin.state === 'loaded' ? AntiSpoofPlugin.model : undefined;


    const boxedAntiSpoofModel = useMemo(
      () => (AntiSpoofModel != null ? NitroModules.box(AntiSpoofModel as any): undefined),
    [AntiSpoofModel]
)

  const faceNetPlugin = useTensorflowModel(
    require("../assets/tflite/mobilefacenet_float16.tflite"), []);


  const faceNetModel =  faceNetPlugin.state === 'loaded' ? faceNetPlugin.model : undefined;


    const boxedMobileFaceModel = useMemo(
      () => (faceNetModel != null ? NitroModules.box(faceNetModel as any): undefined),
    [faceNetModel]
)



  // Keep the shared value challenge synced with the React visual UI state loop
  useEffect(() => {
    activeChallenge.value = step;
  }, [step]);

  // JS Thread Callback: Invoked dynamically when the C++ worker passes the model criteria
const handleVerificationSuccess = useRunOnJS((result: any) => {
    // This blocks runs perfectly safe directly on your main UI state machine
    setOutcome("success");
    triggerInference.value = false;
  }, [user]);

  const handleVerificationFailure = useRunOnJS((errorMessage: string) => {
    setErrorDetails(errorMessage);
    setOutcome("failed");
    triggerInference.value = false;
  }, []);

  const onVerify = () => {
    console.log("🔘 Button physically tapped. Checking criteria:", {
      hasFaceDescriptor: !!faceDescriptor,
      outcome: outcome
    });

    if (!faceDescriptor || outcome === "verifying") return;

    // 🎯 1. Change the React state first to mount the frame processor
    setOutcome("verifying");
    setErrorDetails(null);
    
    // 🎯 2. Open the shared value gate now that the thread is unlocked
    triggerInference.value = true; 
    console.log("🔓 [Shared Value Set] triggerInference.value is now:", triggerInference.value);
  };
  
// 🎯 3. CLEAN UP THE ENTIRE WORKLET DEFINITION
  const frameProcessor = useFrameProcessor((frame) => {
    "worklet";
    
    // Read the values dynamically directly inside the background thread block
    const isTriggered = triggerInference.value;
    const isBusy = isCheckingFrame.value;

    if (!isTriggered || isBusy || !faceDescriptor) return;
    if (boxedAntiSpoofModel == null || boxedMobileFaceModel == null) return;

    // Lock the lane instantly
    isCheckingFrame.value = true;
    console.log("🚦 [GATE PASSED] -> Thread unlocked! Invoking verifyFaceFrame...");

    try {
      const result = verifyFaceFrame({
        frame: frame,
        enrolledFaceDescriptor: faceDescriptor,
        currentChallenge: activeChallenge.value,
        resizePlugin: resize,
        faceDetectorPlugin: detectFaces,
        boxedAntiSpoofInterpreter: boxedAntiSpoofModel,
        boxedMobileFaceInterpreter: boxedMobileFaceModel,
      });

      if (result.error) {
        console.log("❌ [Engine Error]:", result.error);
        isCheckingFrame.value = false;
        handleVerificationFailure(result.error);
      } else if (result.isMatch && result.livenessConfirmed) {
        console.log("🎉 [Match Confirmed] Biometric Vector Distance Verified!");
        isCheckingFrame.value = false;
        handleVerificationSuccess(result);
      } else {
        // Face didn't pass verification criteria yet (keep trying)
        isCheckingFrame.value = false;
      }
    } catch (err: any) {
      isCheckingFrame.value = false;
      console.log("💥 Worklet Exception:", err.message || err);
    }
    // 🎯 CRITICAL: Every single variable used inside must be declared in this tracking array
  }, [faceDescriptor, boxedAntiSpoofModel, boxedMobileFaceModel, triggerInference, isCheckingFrame, activeChallenge, resize, detectFaces]);

  if (!showCamera) {
    return (
      <View className="flex-1 bg-[#eef2f6]">
        <View 
          className="absolute left-0 right-0 z-50 px-6"
          style={{ top: Math.max(insets.top, 16) + 8 }}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            onPress={() => { if (router.canGoBack()) router.back(); }}
            activeOpacity={0.7}
            hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
            className="mb-4 w-10"
          >
            <MaterialCommunityIcons name="arrow-left" size={28} color="#0f172a" />
          </TouchableOpacity>
        </View>

        <View className="flex-1 px-6 pb-8" style={{ paddingTop: Math.max(insets.top, 16) + 64 }}>
          <TouchableOpacity 
            className="flex-1 overflow-hidden rounded-[40px] bg-white shadow-xl elevation-5 items-center justify-center"
            activeOpacity={0.9}
            onPress={() => setShowCamera(true)}
          >
            <MaterialCommunityIcons name="face-recognition" size={120} color="#0f172a" />
            <Text className="mt-8 text-2xl font-medium text-[#0f172a]">Face scan</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
        {/* 🎯 FIX 3: Isolated layout layer ensuring Camera occupies 100% full screen real estate */}
        <View className="absolute inset-0 z-10">
          <CameraPreview
            device={device}
            hasPermission={hasPermission}
            isActive={isActive}
            frameProcessor={outcome === "verifying" ? frameProcessor : undefined}
          />
          <FaceOverlay />
        </View>

        {/* Top Back Action Arrow Header */}
        <View 
          className="absolute left-0 right-0 z-40 px-6"
          style={{ top: Math.max(insets.top, 16) + 8 }}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            onPress={() => {
              if (outcome !== "verifying") {
                setShowCamera(false);
                setOutcome("idle");
                setErrorDetails(null);
              }
            }}
            disabled={outcome === "verifying"}
            activeOpacity={0.7}
            className="mb-4 w-10"
          >
            <MaterialCommunityIcons name="arrow-left" size={28} color="white" />
          </TouchableOpacity>
        </View>

        <LivenessPrompts step={step} />
        
        {/* Challenge rotation selector buttons */}
        {outcome === "idle" && (
          <View className="absolute top-44 left-6 right-6 z-50 flex-row justify-around bg-black/40 p-2 rounded-xl">
            {(["blink", "smile", "turn"] as const).map((challenge) => (
              <TouchableOpacity 
                key={challenge} 
                onPress={() => setStep(challenge)}
                className={`px-3 py-1 rounded-lg ${step === challenge ? 'bg-white' : 'bg-transparent'}`}
              >
                <Text className={step === challenge ? 'text-black font-bold' : 'text-white'}>
                  {challenge.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* 🎯 FIX 4: Replaced layout framework container to safely float over bottom display without dividing screen */}
        <View 
          className="absolute bottom-0 left-0 right-0 z-50 px-6 gap-4"
          style={{ paddingBottom: Math.max(insets.bottom, 24) }}
          pointerEvents="box-none"
        >
          <Text className="text-center text-lg font-medium text-white shadow-sm mb-2 bg-black/50 p-2 rounded-xl">
            {errorDetails ? `❌ ${errorDetails}` : OUTCOME_MESSAGE[outcome]}
          </Text>
          <Button
            label={outcome === "verifying" ? "Analyzing face..." : "Verify Identity"}
            onPress={onVerify}
            disabled={outcome === "verifying"}
          />
        </View>
      </View>
    );
  }
//   return (
//     <View className="flex-1 bg-black">
//       <View 
//         className="absolute left-0 right-0 z-50 px-6"
//         style={{ top: Math.max(insets.top, 16) + 8 }}
//         pointerEvents="box-none"
//       >
//         <TouchableOpacity
//           onPress={() => {
//             if (outcome !== "verifying") {
//               setShowCamera(false);
//               setOutcome("idle");
//               setErrorDetails(null);
//             }
//           }}
//           disabled={outcome === "verifying"}
//           activeOpacity={0.7}
//           hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
//           className="mb-4 w-10"
//         >
//           <MaterialCommunityIcons name="arrow-left" size={28} color="white" />
//         </TouchableOpacity>
//       </View>

//       <CameraPreview
//         device={device}
//         hasPermission={hasPermission}
//         isActive={isActive}
//         frameProcessor={frameProcessor} // 🎯 Bind the continuous C++ validation pipeline
//       />
//       <FaceOverlay />
//       <LivenessPrompts step={step} />
      
//       {/* Challenge rotation selector buttons (For manual override testing if desired) */}
//       {outcome === "idle" && (
//         <View className="absolute top-44 left-6 right-6 z-50 flex-row justify-around bg-black/40 p-2 rounded-xl">
//           {(["blink", "smile", "turn"] as const).map((challenge) => (
//             <TouchableOpacity 
//               key={challenge} 
//               onPress={() => setStep(challenge)}
//               className={`px-3 py-1 rounded-lg ${step === challenge ? 'bg-white' : 'bg-transparent'}`}
//             >
//               <Text className={step === challenge ? 'text-black font-bold' : 'text-white'}>
//                 {challenge.toUpperCase()}
//               </Text>
//             </TouchableOpacity>
//           ))}
//         </View>
//       )}

//       <SafeAreaView style={{ flex: 1 }} pointerEvents="box-none">
//         <View className="flex-1 justify-end gap-4 px-6 pb-8">
//           <Text className="text-center text-lg font-medium text-white shadow-sm mb-2">
//             {errorDetails ? `❌ ${errorDetails}` : OUTCOME_MESSAGE[outcome]}
//           </Text>
//           <Button
//             label={outcome === "verifying" ? "Analyzing face..." : "Verify Identity"}
//             onPress={onVerify}
//             disabled={outcome === "verifying"}
//           />
//         </View>
//       </SafeAreaView>
//     </View>
//   );
// }