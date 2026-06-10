// import { MaterialCommunityIcons } from "@expo/vector-icons";
// import { useEffect, useState, useRef } from "react";
// import { useRouter } from "expo-router";
// import { Text, TouchableOpacity, View, Image } from "react-native";
// import { useSharedValue } from "react-native-reanimated";
// import { useSafeAreaInsets } from "react-native-safe-area-context";
// import { useFrameProcessor } from "react-native-vision-camera";
// import { useFaceDetector } from "react-native-vision-camera-face-detector";
// import { useRunOnJS } from "react-native-worklets-core";
// import { useResizePlugin } from "vision-camera-resize-plugin";
// import { useTensorflowModel } from "react-native-fast-tflite";
// import { NitroModules } from "react-native-nitro-modules";

// import { CameraPreview } from "@/components/camera/CameraPreview";
// import { FaceOverlay } from "@/components/camera/FaceOverlay";
// import { LivenessPrompts } from "@/components/camera/LivenessPrompts";
// import { Button } from "@/components/common/Button";
// import { config } from "@/constants/config";
// import { useCameraSession } from "@/hooks/useCameraSession";
// import { verifyFaceFrame } from "@/lib/cameraInterface";
// import { useAuthStore } from "@/store/authStore";
// import type { LivenessStep } from "@/types";

// type Outcome = "idle" | "verifying" | "success" | "failed";

// const OUTCOME_MESSAGE: Record<Outcome, string> = {
//   idle: "Position your face in the frame, then verify.",
//   verifying: "Running real-time AI verification…",
//   success: "Attendance recorded successfully.",
//   failed: "Verification failed. Unknown profile or spoof detected.",
// };

// import * as Brightness from "expo-brightness";



// export default function Verify() {
//   const { device, hasPermission, isActive } = useCameraSession();
//   const user = useAuthStore((s) => s.user);
//   const faceDescriptor = useAuthStore((s) => s.faceDescriptor);

//   const insets = useSafeAreaInsets();
//   const detectFaces = useFaceDetector({ performanceMode: 'accurate', landmarkMode: 'all', classificationMode: 'all' });
//   const { resize } = useResizePlugin();


//   const [cameraPosition, setCameraPosition] = useState<'front' | 'back'>('front');
//   const [isFlashOn, setIsFlashOn] = useState(false);
//   const [outcome, setOutcome] = useState<Outcome>("idle");
//   const [step, setStep] = useState<LivenessStep>(config.LIVENESS_STEPS[0]);
//   const [croppedPreview, setCroppedPreview] = useState<string | null>(null);
//   const [errorDetails, setErrorDetails] = useState<string | null>(null);

//   // Put this hook inside your Verify main function block:
//   const initialBrightness = useRef<number>(0.5);

//   useEffect(() => {
//     async function runSoftboxLightingEngine() {
//       try {
//         if (outcome === "verifying" && cameraPosition === "front" && isFlashOn) {
//           // Capture what brightness the user had so we don't blind them permanently
//           initialBrightness.current = await Brightness.getBrightnessAsync();
          
//           // Boost ONLY your current application window to absolute 100% maximum power
//           await Brightness.setBrightnessAsync(1.0);
//         } else {
//           // Reset the phone back to normal when checking finishes
//           await Brightness.setBrightnessAsync(initialBrightness.current);
//         }
//       } catch (err) {
//         console.log("⚠️ Window illumination driver failed:", err);
//       }
//     }

//     runSoftboxLightingEngine();
//   }, [outcome, cameraPosition, isFlashOn]);


//   const isCheckingFrame = useSharedValue(false);
//   const activeChallenge = useSharedValue<"blink" | "smile" | "turn">("blink");
  
//   const faceNetPlugin = useTensorflowModel(require("../assets/tflite/w600k_mbf_fixed_float32.tflite"), []);
//   const [boxedMobileFaceModel, setBoxedMobileFaceModel] = useState<any>(null);

//   useEffect(() => {
//     if (faceNetPlugin.state === "loaded" && faceNetPlugin.model && !boxedMobileFaceModel) {
//       setBoxedMobileFaceModel(NitroModules.box(faceNetPlugin.model as any));
//     }
//   }, [faceNetPlugin.state, faceNetPlugin.model]);


//   const MiniFasPlugin = useTensorflowModel(require("../assets/tflite/minifasnet_float32.tflite"), []);
//   const [boxedMiniFasModel, setBoxedMiniFasModel] = useState<any>(null);

//   useEffect(() => {
//     if (MiniFasPlugin.state === "loaded" && MiniFasPlugin.model && !boxedMiniFasModel) {
//       setBoxedMiniFasModel(NitroModules.box(MiniFasPlugin.model as any));
//     }
//   }, [MiniFasPlugin.state, MiniFasPlugin.model]);

//   useEffect(() => { activeChallenge.value = step; }, [step]);

//   // const handleVerificationSuccess = useRunOnJS((result: any) => {
//   //   console.log("🏆 Match confirmed!");
//   //   if (result.diagonise) setCroppedPreview(result.diagonise);
//   //   setOutcome("success");
//   // }, []);

//   const handleVerificationSuccess = useRunOnJS((result: any) => {
//     // 🎯 PRINT IDENTITY DETAILS AND VERDICT SCORE IN CONSOLE
//     console.log(
//       "🏆 [UI Thread - MATCH LOCKED SUCCESS]:",
//       `\n  ├─ Enrolled Profile Name: ${user?.name || "Unknown Identity Account"}`,
//       `\n  ├─ Vector Matching Confidence: ${(result.confidence * 100).toFixed(4)}%`,
//       `\n  └─ Access Pipeline Status: Attendance recorded successfully.`
//     );

//     if (result.diagonise) setCroppedPreview(result.diagonise);
//     setOutcome("success");
//   }, [user]); // Added user dependency to read names securely across thread transitions

//   const handleVerificationFailure = useRunOnJS((errorMessage: string) => {
//     console.log("❌ Verification failed:", errorMessage);
//     setErrorDetails(errorMessage);
//     setOutcome("failed");
//   }, []);

//   const setLivePreviewOnUIThread = useRunOnJS((uri: string) => {
//     setCroppedPreview(uri);
//   }, []);

//   const onVerify = () => {
//     if (!faceDescriptor || outcome === "verifying") return;
//     setOutcome("verifying");
//     setErrorDetails(null);
//   };
  
//   const frameProcessor = useFrameProcessor((frame) => {
//     "worklet";
//     if (isCheckingFrame.value || !faceDescriptor || boxedMobileFaceModel == null) return;

//     isCheckingFrame.value = true;

//     try {
//       const result = verifyFaceFrame({
//         frame,
//         enrolledFaceDescriptor: faceDescriptor,
//         currentChallenge: activeChallenge.value,
//         resizePlugin: resize,
//         faceDetectorPlugin: detectFaces,
//         boxedAntiSpoofInterpreter: boxedMiniFasModel,
//         boxedMobileFaceInterpreter: boxedMobileFaceModel,
//         user: user,
//       });

//       if (result.isMatch && result.livenessConfirmed) {
//         handleVerificationSuccess(result);
//       } else if (result.error) {
//         if (result.diagonise) setLivePreviewOnUIThread(result.diagonise);
//         isCheckingFrame.value = false;
//         handleVerificationFailure(result.error);
//       } else {
//         if (result.diagonise) setLivePreviewOnUIThread(result.diagonise);
//         isCheckingFrame.value = false; 
//       }
//     } catch (err: any) {
//       isCheckingFrame.value = false;
//       handleVerificationFailure(err.message || "Native runtime failure");
//     }
//   }, [faceDescriptor, boxedMobileFaceModel, boxedMiniFasModel, isCheckingFrame, activeChallenge, resize, detectFaces]);    

//   const TypedCameraPreview = CameraPreview as any;
//   const router = useRouter();
  
//   return (
//     <View className="flex-1 bg-black relative">
      
//       {/* 📸 Core Camera View Layer */}
//         <View className="absolute inset-0 z-10">
//         {device && (
//           <TypedCameraPreview 
//             device={device} 
//             hasPermission={hasPermission} 
//             isActive={isActive} 
//             frameProcessor={outcome === "verifying" ? frameProcessor : undefined} 
            
//             // ⚡ BACK CAMERA LIGHTING CONTROL: 
//             // Only ignites the hardware LED if we are using the back camera and flash state is true
//             torch={cameraPosition === "back" && isFlashOn && outcome === "verifying" ? "on" : "off"} 
//           />
//         )}
//         {/* Hide standard overlay lines during active front flash mask to preserve clean real-estate space */}
//         {!(outcome === "verifying" && cameraPosition === "front" && isFlashOn) && <FaceOverlay />}
//       </View>

//       {/* =============================================================================
//           💡 OPTION 2: FULL-SCREEN SOFTBOX MASK (Maximum Front-Facing Flash Effect)
//           ============================================================================= */}
//       {outcome === "verifying" && (
//         <View 
//           pointerEvents="none" 
//           className="absolute inset-0 z-20 bg-white flex justify-center items-center"
//         >
//           {/* 🎯 THE HOLE-PUNCH CUTOUT MATRIX:
//             The massive border width (e.g., border-[600px]) paints the entire 
//             screen outside the circle solid white, while the center remains 
//             transparent so the camera stream can capture your face flawlessly.
//           */}
//           <View 
//             className="w-72 h-72 rounded-full border-[600px] border-white bg-transparent absolute"
//             style={{ transform: [{ scale: 1.2 }] }} // Micro-adjust size to fit your framing layout
//           />
          
//           {/* Optional text indicator for user guidance during the flash */}
//           <Text className="text-slate-800 font-bold tracking-widest text-sm absolute top-24">
//             LOOK HERE • SCANNING LIVENESS
//           </Text>
//         </View>
//       )}

//       {/* =============================================================================
//           🎛️ FLOATING HARDWARE CONTROL DECK (Top-Right Corner)
//           ============================================================================= */}
//       <View className="absolute top-12 right-6 z-50 flex-row gap-3">
        
//         {/* ⚡ Toggle Flash Button */}
//         <TouchableOpacity
//           activeOpacity={0.7}
//           onPress={() => setIsFlashOn(!isFlashOn)}
//           className={`px-4 py-2.5 rounded-full border ${
//             isFlashOn ? "bg-amber-500 border-amber-400" : "bg-slate-900/80 border-slate-800"
//           }`}
//         >
//           <Text className={`font-bold text-xs tracking-wider ${isFlashOn ? "text-slate-950" : "text-white"}`}>
//             {isFlashOn ? "⚡ FLASH: ON" : "⚡ FLASH: OFF"}
//           </Text>
//         </TouchableOpacity>

//         {/* 🔄 Flip Camera Button */}
//         <TouchableOpacity
//           activeOpacity={0.7}
//           onPress={() => {
//             // Invert layout selection hook
//             setCameraPosition(cameraPosition === "front" ? "back" : "front");
//           }}
//           className="bg-slate-900/80 px-4 py-2.5 rounded-full border border-slate-800"
//         >
//           <Text className="text-white font-bold text-xs tracking-wider">
//             🔄 {cameraPosition === "front" ? "SWITCH TO BACK" : "SWITCH TO FRONT"}
//           </Text>
//         </TouchableOpacity>
//       </View>


//       {/* =============================================================================
//         ⬅️ FLOATING BACK ARROW (Safe overlay positioned in the top-left corner)
//         ============================================================================= */}
//       <TouchableOpacity
//         activeOpacity={0.7}
//         onPress={() => router.back()} // ◄ Instantly pops screen and goes back safely!
//         className="absolute top-12 left-6 z-50 bg-slate-900/80 px-4 py-2.5 rounded-full border border-slate-800"
//       >
//         <Text className="text-white font-medium text-xs tracking-wider">
//           ← BACK TO MENU
//         </Text>
//       </TouchableOpacity>

//       {/* Your Camera & Processing Layers continue down here... */}

//       {/* 🔘 Your Control Buttons & Previews Layer */}
//       <View className="absolute bottom-10 inset-x-0 z-30 px-6">
//         {/* UI Triggers and Outcome Status Layout Cards */}
//       </View>


//       {/* ============================================================================= */}
//       {/* 🌟 SPLIT-SCREEN PREVIEW PANELS: ENROLLED BASELINE REFERENCE VS LIVE EVALUATION */}
//       {/* ============================================================================= */}

//       {/* PANEL 1: ENROLLED IMAGE FROM THE DATABASE (LEFT SIDE) */}
//       {user?.profileImage && (
//         <View className="absolute top-36 left-6 z-50 border-2 border-blue-500 rounded-2xl overflow-hidden shadow-2xl bg-slate-900 p-2">
//           <Text className="text-[10px] text-blue-500 font-bold text-center mb-1">ENROLLED BASELINE</Text>
//           <Image source={{ uri: user.profileImage }} className="w-28 h-28 rounded-xl bg-black" resizeMode="contain" />
//           <Text className="text-[10px] text-white text-center mt-1 font-semibold truncate w-28">{user.name}</Text>
//         </View>
//       )}

//       {/* PANEL 2: CURRENT CAMERA LIVE STREAM TARGET MATRIX (RIGHT SIDE) */}
//       {croppedPreview && (
//         <View className="absolute top-36 right-6 z-50 border-2 border-amber-400 rounded-2xl overflow-hidden shadow-2xl bg-slate-900 p-2">
//           <Text className="text-[10px] text-amber-400 font-bold text-center mb-1">WHAT THE MODEL SEES</Text>
//           <Image source={{ uri: croppedPreview }} className="w-28 h-28 rounded-xl bg-black" resizeMode="contain" />
//           <Text className="text-[10px] text-white text-center mt-1 font-semibold">Live stream</Text>
//         </View>
//       )}

//       <View className="absolute left-0 right-0 z-40 px-6" style={{ top: Math.max(insets.top, 16) + 8 }} pointerEvents="box-none">
//         <TouchableOpacity onPress={() => { if (outcome !== "verifying") setOutcome("idle"); }} disabled={outcome === "verifying"} className="mb-4 w-10">
//           <MaterialCommunityIcons name="arrow-left" size={28} color="white" />
//         </TouchableOpacity>
//       </View>

//       <LivenessPrompts step={step} />
      
//       {outcome === "idle" && (
//         <View className="absolute top-44 left-6 right-6 z-50 flex-row justify-around bg-black/40 p-2 rounded-xl">
//           {(["blink", "smile", "turn"] as const).map((challenge) => (
//             <TouchableOpacity key={challenge} onPress={() => setStep(challenge)} className={`px-3 py-1 rounded-lg ${step === challenge ? 'bg-white' : 'bg-transparent'}`}>
//               <Text className={step === challenge ? 'text-black font-bold' : 'text-white'}>{challenge.toUpperCase()}</Text>
//             </TouchableOpacity>
//           ))}
//         </View>
//       )}

//       <View className="absolute bottom-0 left-0 right-0 z-50 px-6 gap-4" style={{ paddingBottom: Math.max(insets.bottom, 24) }} pointerEvents="box-none">
//         <Text className="text-center text-lg font-medium text-white shadow-sm mb-2 bg-black/50 p-2 rounded-xl">
//           {errorDetails ? `❌ ${errorDetails}` : OUTCOME_MESSAGE[outcome]}
//         </Text>
//         <Button label={outcome === "verifying" ? "Analyzing face..." : "Verify Identity"} onPress={onVerify} disabled={outcome === "verifying"} />
//       </View>
//     </View>
//   );
// }

import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";
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
import { verifyFaceFrame, checkChallenge } from "@/lib/cameraInterface";
import { useAuthStore } from "@/store/authStore";
import type { LivenessStep, VerificationPhase } from "@/types";
import { useGlobalModels } from "../context/ModelContext";

const PROMPT_LABELS: Record<string, string> = {
  blink: "Blink your eyes",
  smile: "Smile",
  turn: "Turn your head",
};

const getPhaseMessage = (phase: VerificationPhase, challengePair: LivenessStep[]): string => {
  switch(phase) {
    case "idle": return "Position your face, then tap Verify.";
    case "challenge_1": return challengePair[0] ? PROMPT_LABELS[challengePair[0]] : "";
    case "challenge_2": return challengePair[1] ? PROMPT_LABELS[challengePair[1]] : "";
    case "awaiting_frontal": return "✓ Challenges passed. Look straight ahead.";
    case "running_inference": return "Keep your face straight...";
    case "success": return "Attendance recorded.";
    case "failed": return "Verification failed.";
    default: return "";
  }
};

import * as Brightness from "expo-brightness";

export default function Verify() {
  const { device: defaultDevice, hasPermission, isActive } = useCameraSession();
  const user = useAuthStore((s) => s.user);
  const faceDescriptor = useAuthStore((s) => s.faceDescriptor);

  const insets = useSafeAreaInsets();
  const detectFaces = useFaceDetector({ performanceMode: 'accurate', landmarkMode: 'all', classificationMode: 'all' });
  const { resize } = useResizePlugin();

  const [cameraPosition, setCameraPosition] = useState<'front' | 'back'>('front');
  const [isFlashOn, setIsFlashOn] = useState(false);
  
  const [phase, setPhase] = useState<VerificationPhase>("idle");
  const [challengePairState, setChallengePairState] = useState<LivenessStep[]>([]);
  const [croppedPreview, setCroppedPreview] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);

  const initialBrightness = useRef<number>(0.5);
  const isVerifying = phase !== "idle" && phase !== "success" && phase !== "failed";

  useEffect(() => {
    async function runSoftboxLightingEngine() {
      try {
        if (isVerifying && cameraPosition === "front" && isFlashOn) {
          initialBrightness.current = await Brightness.getBrightnessAsync();
          await Brightness.setBrightnessAsync(1.0);
        } else {
          await Brightness.setBrightnessAsync(initialBrightness.current);
        }
      } catch (err) {
        console.log("⚠️ Window illumination driver failed:", err);
      }
    }
    runSoftboxLightingEngine();
  }, [isVerifying, cameraPosition, isFlashOn]);

  const isCheckingFrame = useSharedValue(false);
  const challengePair = useSharedValue<LivenessStep[]>([]);
  const currentPhase = useSharedValue<VerificationPhase>("idle");
  const challengeConfirmCount = useSharedValue(0);
  const frontalDelayCount = useSharedValue(0);
  const inferenceFrameCount = useSharedValue(0);
  
  const { boxedMobileFaceModel, isModelLoaded } = useGlobalModels();

  const handlePhaseAdvance = useRunOnJS((nextPhase: VerificationPhase) => {
    setPhase(nextPhase);
  }, []);

  const handleVerificationSuccess = useRunOnJS((result: any) => {
    console.log(
      "🏆 [UI Thread - MATCH LOCKED SUCCESS]:",
      `\n  ├─ Enrolled Profile Name: ${user?.name || "Unknown Identity Account"}`,
      `\n  ├─ Vector Matching Confidence: ${(result.confidence * 100).toFixed(4)}%`
    );
    if (result.diagonise) setCroppedPreview(result.diagonise);
    setPhase("success");
    currentPhase.value = "success";
  }, [user]);

  const handleVerificationFailure = useRunOnJS((errorMessage: string) => {
    console.log("❌ Verification failed:", errorMessage);
    setErrorDetails(errorMessage);
    setPhase("failed");
    currentPhase.value = "failed";
  }, []);

  const setLivePreviewOnUIThread = useRunOnJS((uri: string) => {
    setCroppedPreview(uri);
  }, []);

  const onVerify = () => {
    if (!faceDescriptor || isVerifying) return;
    const pool: LivenessStep[] = ["blink", "smile", "turn"];
    const shuffled = pool.sort(() => Math.random() - 0.5).slice(0, 2);
    challengePair.value = shuffled;
    setChallengePairState(shuffled);
    setErrorDetails(null);
    setPhase("challenge_1");
    currentPhase.value = "challenge_1";
    inferenceFrameCount.value = 0;
  };
  
  const frameProcessor = useFrameProcessor((frame) => {
    "worklet";
    if (isCheckingFrame.value || !faceDescriptor || boxedMobileFaceModel == null) return;

    const currentP = currentPhase.value;

    if (currentP === "challenge_1" || currentP === "challenge_2") {
      const faces = detectFaces.detectFaces(frame);
      if (!faces || faces.length === 0) return;

      const challengeIndex = currentP === "challenge_1" ? 0 : 1;
      if (!challengePair.value || challengePair.value.length < 2) return;
      
      const challenge = challengePair.value[challengeIndex];
      const passed = checkChallenge(faces[0], challenge);

      if (passed) {
        challengeConfirmCount.value += 1;
        if (challengeConfirmCount.value >= config.LIVENESS_CHALLENGE_CONFIRM_FRAMES) {
          challengeConfirmCount.value = 0;
          if (currentP === "challenge_1") {
             currentPhase.value = "challenge_2";
             handlePhaseAdvance("challenge_2");
             return; // Stop here and wait for next frame to start challenge 2
          } else {
             // Both challenges passed. Go directly to inference.
             currentPhase.value = "running_inference";
             handlePhaseAdvance("running_inference");
             // DO NOT return here, so it can fall through to the inference block below
          }
        } else {
          return; // Wait for more frames to confirm the current challenge
        }
      } else {
        challengeConfirmCount.value = 0;
        return; // Challenge not passed in this frame
      }
    }

    if (currentPhase.value === "awaiting_frontal") {
      const faces = detectFaces.detectFaces(frame);
      if (!faces || faces.length === 0) return;
      
      // Delay before running inference so the user has a moment to read "Challenges passed"
      // and look straight ahead. We use a shared value counter for the delay in frames.
      // 30 frames at 30fps is about 1 second.
      if (frontalDelayCount.value < 70) {
        frontalDelayCount.value += 1;
        return;
      }
      frontalDelayCount.value = 0;

      // We removed the strict FRONTAL_YAW_THRESHOLD_DEG check here as requested.
      // As long as a face is detected after the challenges, we proceed to inference.
      currentPhase.value = "running_inference";
      handlePhaseAdvance("running_inference");
      // Fall through to inference
    }

    if (currentPhase.value === "running_inference") {
      inferenceFrameCount.value += 1;
      
      if (inferenceFrameCount.value > 100) {
        handleVerificationFailure("Face did not match enrolled profile. Trial limit reached.");
        return;
      }

      isCheckingFrame.value = true;
      try {
        const result = verifyFaceFrame({
          frame,
          enrolledFaceDescriptor: faceDescriptor,
          currentChallenge: "blink", // Not used anymore but kept for type compatibility
          resizePlugin: resize,
          faceDetectorPlugin: detectFaces,
          boxedMobileFaceInterpreter: boxedMobileFaceModel,
          user: user,
          cameraPosition: cameraPosition, 
          isFlashOn: isFlashOn,           
        });

        if (result.isMatch && result.livenessConfirmed) {
          handleVerificationSuccess(result);
        } else if (result.error) {
          if (result.diagonise) setLivePreviewOnUIThread(result.diagonise);
          isCheckingFrame.value = false;
          handleVerificationFailure(result.error);
        } else {
          if (result.diagonise) setLivePreviewOnUIThread(result.diagonise);
          isCheckingFrame.value = false; 
        }
      } catch (err: any) {
        isCheckingFrame.value = false;
        handleVerificationFailure(err.message || "Native runtime failure");
      }
    }
  }, [faceDescriptor, boxedMobileFaceModel, isCheckingFrame, challengePair, currentPhase, challengeConfirmCount, inferenceFrameCount, resize, detectFaces, cameraPosition, isFlashOn]);    

  const TypedCameraPreview = CameraPreview as any;
  const router = useRouter();
  
  return (
    <View className="flex-1 bg-black relative">
      
      {/* 📸 Core Camera View Layer */}
      <View className="absolute inset-0 z-10">
        {defaultDevice && (
          <TypedCameraPreview 
            cameraPosition={cameraPosition} 
            hasPermission={hasPermission} 
            isActive={isActive} 
            frameProcessor={isVerifying ? frameProcessor : undefined} 
            torch={cameraPosition === "back" && isFlashOn && isVerifying ? "on" : "off"} 
          />
        )}
        
        {!(isVerifying && cameraPosition === "front" && isFlashOn) && <FaceOverlay />}
      </View>

      {isVerifying && cameraPosition === "front" && isFlashOn && (
        <View pointerEvents="none" className="absolute inset-0 z-20 bg-white flex justify-center items-center">
          <View className="w-72 h-72 rounded-full border-[600px] border-white bg-transparent absolute" style={{ transform: [{ scale: 1.2 }] }} />
          <Text className="text-slate-800 font-bold tracking-widest text-sm absolute top-24">LOOK HERE • SCANNING LIVENESS</Text>
        </View>
      )}

      <View className="absolute top-12 right-6 z-50 flex-row gap-3">
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setIsFlashOn(!isFlashOn)}
          className={`px-4 py-2.5 rounded-full border ${
            isFlashOn ? "bg-amber-500 border-amber-400" : "bg-slate-900/80 border-slate-800"
          }`}
        >
          <Text className={`font-bold text-xs tracking-wider ${isFlashOn ? "text-slate-950" : "text-white"}`}>
            {isFlashOn ? "⚡ FLASH: ON" : "⚡ FLASH: OFF"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            setCameraPosition(cameraPosition === "front" ? "back" : "front");
          }}
          className="bg-slate-900/80 px-4 py-2.5 rounded-full border border-slate-800"
        >
          <Text className="text-white font-bold text-xs tracking-wider">
            🔄 {cameraPosition === "front" ? "FRONT" : "BACK"}
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => router.back()}
        className="absolute top-12 left-6 z-50 bg-slate-900/80 px-4 py-2.5 rounded-full border border-slate-800"
      >
        <Text className="text-white font-medium text-xs tracking-wider">← MENU</Text>
      </TouchableOpacity>

      {user?.profileImage && (
        <View className="absolute top-36 left-6 z-50 border-2 border-blue-500 rounded-2xl overflow-hidden shadow-2xl bg-slate-900 p-2">
          <Text className="text-[10px] text-blue-500 font-bold text-center mb-1">ENROLLED BASELINE</Text>
          <Image source={{ uri: user.profileImage }} className="w-28 h-28 rounded-xl bg-black" resizeMode="contain" />
          <Text className="text-[10px] text-white text-center mt-1 font-semibold truncate w-28">{user.name}</Text>
        </View>
      )}

      {croppedPreview && (
        <View className="absolute top-36 right-6 z-50 border-2 border-amber-400 rounded-2xl overflow-hidden shadow-2xl bg-slate-900 p-2">
          <Text className="text-[10px] text-amber-400 font-bold text-center mb-1">WHAT THE MODEL SEES</Text>
          <Image source={{ uri: croppedPreview }} className="w-28 h-28 rounded-xl bg-black" resizeMode="contain" />
          <Text className="text-[10px] text-white text-center mt-1 font-semibold">Live stream</Text>
        </View>
      )}

      {phase === "challenge_1" && <LivenessPrompts label={PROMPT_LABELS[challengePairState[0]]} />}
      {phase === "challenge_2" && <LivenessPrompts label={PROMPT_LABELS[challengePairState[1]]} />}

      <View className="absolute bottom-0 left-0 right-0 z-50 px-6 gap-4" style={{ paddingBottom: Math.max(insets.bottom, 24) }} pointerEvents="box-none">
        <Text className="text-center text-lg font-medium text-white shadow-sm mb-2 bg-black/50 p-2 rounded-xl">
          {errorDetails ? `❌ ${errorDetails}` : getPhaseMessage(phase, challengePairState)}
        </Text>
        <Button label={isVerifying ? "Analyzing face..." : "Verify Identity"} onPress={onVerify} disabled={isVerifying} />
      </View>
    </View>
  );
}
