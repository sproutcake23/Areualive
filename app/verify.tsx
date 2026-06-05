import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
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
import { verifyFaceFrame } from "@/lib/cameraInterface";
import { useAuthStore } from "@/store/authStore";
import type { LivenessStep } from "@/types";
import { useTensorflowModel } from "react-native-fast-tflite";
import { NitroModules } from "react-native-nitro-modules";
import { router } from "expo-router";
import * as crypto from "expo-crypto";

import { insertAttendanceRecords, countUnsyncedRecords } from "@/lib/db";
import { useSyncStore } from "@/store/syncStore";

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
// Ensure performance mode tracks landmarks explicitly
  const detectFaces = useFaceDetector({
    performanceMode: 'accurate',     // 🔥 Forces the engine to calculate precision vectors
    landmarkMode: 'all',            // 🔥 MANDATORY: Tells the C++ layer to populate the .landmarks object
    classificationMode: 'all'
  });
  const { resize } = useResizePlugin();
  const setPendingCount = useSyncStore((s) => s.setPendingCount);

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
  const activeChallenge = useSharedValue<"blink" | "smile" | "turn">("blink");
  
  // 🎯 1. Load the raw fast-tflite plugins smoothly
  const AntiSpoofPlugin = useTensorflowModel(require("../assets/tflite/4T80x80_minifasnetV1se_float32.tflite") , []);
  const faceNetPlugin = useTensorflowModel(require("../assets/tflite/mac_mobilefacenet.tflite") , []);

  // 🎯 2. Create active state slots to hold the C++ thread boxes
  const [boxedAntiSpoofModel, setBoxedAntiSpoofModel] = useState<any>(null);
  const [boxedMobileFaceModel, setBoxedMobileFaceModel] = useState<any>(null);
  // At the top of your Verify component
  const [croppedPreview, setCroppedPreview] = useState<string | null>(null);

  // 🎯 3. Active synchronized monitor block
  useEffect(() => {
    console.log("📡 [Model Synchronizer Check] State Progress -> AntiSpoof:", AntiSpoofPlugin.state, "| FaceNet:", faceNetPlugin.state);

    if (AntiSpoofPlugin.state === "loaded" && AntiSpoofPlugin.model) {
      if (!boxedAntiSpoofModel) {
        setBoxedAntiSpoofModel(NitroModules.box(AntiSpoofPlugin.model as any));
        console.log("📦 [Boxed] MiniFASNet C++ Pointer securely packed!");
      }
    }

    if (faceNetPlugin.state === "loaded" && faceNetPlugin.model) {
      if (!boxedMobileFaceModel) {
        setBoxedMobileFaceModel(NitroModules.box(faceNetPlugin.model as any));
        console.log("📦 [Boxed] MobileFaceNet C++ Pointer securely packed!");
      }
    }
  }, [AntiSpoofPlugin.state, faceNetPlugin.state, AntiSpoofPlugin.model, faceNetPlugin.model]);


  // Keep the shared value challenge synced with the React visual UI state loop
  useEffect(() => {
    activeChallenge.value = step;
  }, [step]);

  // JS Thread Callback: Invoked dynamically when the C++ worker passes the model criteria
  // const handleVerificationSuccess = useRunOnJS((result: any) => {
  //   // This blocks runs perfectly safe directly on your main UI state machine
  //   console.log("🏆 [UI Thread] Match confirmed! Shutting down engine & navigating...");
  //   setOutcome("success");
  //   router.replace("/verify");
  // }, [user]);

  const handleVerificationSuccess = useRunOnJS(async (result: any) => {
    console.log("🏆 Match confirmed! Saving attendance to secure local database...");
    
    if (result.diagonise) {
      setCroppedPreview(result.diagonise); // Set preview image path
    }
    
    if (user?.id) {
      try {
        const newRecord = {
          id: crypto.randomUUID(),
          userId: user.id,
          timestamp: new Date().toISOString(),
          confidence: result.confidence || 0,
          livenessConfirmed: result.livenessConfirmed,
          synced: false
        };

        // 1. Write safely to SQLite WAL
        await insertAttendanceRecords([newRecord]);
        
        // 2. Refresh the global badge count
        const pending = await countUnsyncedRecords();
        setPendingCount(pending);

        console.log("✅ Attendance stored offline successfully. Awaiting network sync.");
      } catch (err) {
        console.log("❌ Database Write Error:", err);
      }
    }

    setOutcome("success");
  }, [user]);



  const handleVerificationFailure = useRunOnJS((errorMessage: string) => {
    console.log("❌ [UI Thread] Verification halted:", errorMessage);
    setErrorDetails(errorMessage);
    
    setOutcome("failed");
    alert(`Verification Failed: ${errorMessage}`);

  }, []);

  const handleDebugPreview = useRunOnJS((uri: string) => {
    setCroppedPreview(uri);
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


  };
  
// 🎯 3. CLEAN UP THE ENTIRE WORKLET DEFINITION
  const frameProcessor = useFrameProcessor((frame) => {
    "worklet";
    

    if ( isCheckingFrame.value || !faceDescriptor) { 
      console.log(
        "🚧 [Worklet Loop Status]",
        "\n  ├── isCheckingFrame:", isCheckingFrame.value,
        "\n  └── faceDescriptor Matrix Loaded:", faceDescriptor != null ? "✅ YES" : "❌ NO"
      );
      return;
    }

    if (boxedAntiSpoofModel == null || boxedMobileFaceModel == null) {  
      console.log("⚠️ Models are null inside the worklet context!");
      return;
    }

    // 🚦 Lane Unlocked! 
    isCheckingFrame.value = true;
    console.log("🚀 [DERIVED ENGINE ACTIVE] Both gates cleared! Processing face tensors...");

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

      // 🎯 THE BRIDGE CAPTURE: Check what the C++ engine returned
      if (result.isMatch && result.livenessConfirmed) {
        console.log("🎉 C++ Thread Match! Teleporting to Success Handler...");
        
        // 🔏 RULE: You MUST wrap the JS function in runOnJS() when inside a worklet!
        handleVerificationSuccess(result);
        
        // Keep the lane locked (isCheckingFrame = true) so no new frames process 
        // while the screen transitions!
      } else if (result.error) {
        // 🎯 FIX: Do not halt the entire process just because MLKit is taking an extra frame to calculate landmarks.
        // Silently loop until the landmarks resolve.
        if (result.error === "WAITING_FOR_LANDMARKS") {
          isCheckingFrame.value = false;
          return;
        }

        if (result.diagonise) {
          handleDebugPreview(result.diagonise); // 🎯 FIX: Call via UI thread handler
        }
        console.log("❌ C++ Thread Error! Teleporting to Failure Handler...");
        
        isCheckingFrame.value = false; // Unlock the lane so they can attempt again
        handleVerificationFailure(result.error);
      } else {
          if (result.diagonise) {
            handleDebugPreview(result.diagonise); // 🎯 FIX: Call via UI thread handler
          }
        // The frame just didn't pass the challenge criteria yet (e.g., waiting for a blink).
        // Safely unlock the lane to let the next video frame stream through.
        isCheckingFrame.value = false; 
      }

    } catch (err: any) {
      isCheckingFrame.value = false;
      console.log("💥 Worklet Exception:", err.message || err);
      
      // Pass unexpected structural runtime crashes back to the UI thread
      handleVerificationFailure(err.message || "Native runtime exception");
    }

    // 🎯 CRITICAL: Add your JS handlers to the dependency array so the worklet can reference them!
  }, [faceDescriptor, boxedAntiSpoofModel, boxedMobileFaceModel, isCheckingFrame, activeChallenge, resize, detectFaces, handleVerificationSuccess, handleVerificationFailure, handleDebugPreview]);    


  return (
    <View className="flex-1 bg-black">
        {/* 🎯 FIX 3: Isolated layout layer ensuring Camera occupies 100% full screen real estate */}
        <View className="absolute inset-0 z-10">
        <CameraPreview
          device={device}
          hasPermission={hasPermission}
          isActive={isActive}
          // 🎯 If idle, failed, or success, the frame processor is undefined and completely turned off.
          // It ONLY runs while outcome is strictly set to "verifying".
          frameProcessor={outcome === "verifying" ? frameProcessor : undefined} 
        />
          <FaceOverlay />
        </View>

        {croppedPreview && (
          <View className="absolute top-36 right-6 z-50 border-2 border-amber-400 rounded-2xl overflow-hidden shadow-2xl bg-slate-900 p-2">
            <Text className="text-[10px] text-amber-400 font-bold text-center mb-1">WHAT THE MODEL SEES</Text>
            
            {/* 🎯 FIX: Cast Image to any to bypass the missing props definition */}
            {(() => {
              const DebugImage = require("react-native").Image as any;
              return (
                <DebugImage 
                  source={{ uri: croppedPreview }} 
                  className="w-28 h-28 rounded-xl bg-black"
                  resizeMode="contain"
                />
              );
            })()}

          </View>
        )}

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