import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Text, TouchableOpacity, View, Image } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFrameProcessor } from "react-native-vision-camera";
import { useFaceDetector } from "react-native-vision-camera-face-detector";
import { useRunOnJS } from "react-native-worklets-core";
import { useResizePlugin } from "vision-camera-resize-plugin";
import { useTensorflowModel } from "react-native-fast-tflite";
import { NitroModules } from "react-native-nitro-modules";

import { CameraPreview } from "@/components/camera/CameraPreview";
import { FaceOverlay } from "@/components/camera/FaceOverlay";
import { LivenessPrompts } from "@/components/camera/LivenessPrompts";
import { Button } from "@/components/common/Button";
import { config } from "@/constants/config";
import { useCameraSession } from "@/hooks/useCameraSession";
import { verifyFaceFrame } from "@/lib/cameraInterface";
import { useAuthStore } from "@/store/authStore";
import type { LivenessStep } from "@/types";

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

  const insets = useSafeAreaInsets();
  const detectFaces = useFaceDetector({ performanceMode: 'accurate', landmarkMode: 'all', classificationMode: 'all' });
  const { resize } = useResizePlugin();

  const [outcome, setOutcome] = useState<Outcome>("idle");
  const [step, setStep] = useState<LivenessStep>(config.LIVENESS_STEPS[0]);
  const [croppedPreview, setCroppedPreview] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);

  const isCheckingFrame = useSharedValue(false);
  const activeChallenge = useSharedValue<"blink" | "smile" | "turn">("blink");
  
  const faceNetPlugin = useTensorflowModel(require("../assets/tflite/w600k_mbf_fixed_float32.tflite"), []);
  const [boxedMobileFaceModel, setBoxedMobileFaceModel] = useState<any>(null);

  useEffect(() => {
    if (faceNetPlugin.state === "loaded" && faceNetPlugin.model && !boxedMobileFaceModel) {
      setBoxedMobileFaceModel(NitroModules.box(faceNetPlugin.model as any));
    }
  }, [faceNetPlugin.state, faceNetPlugin.model]);

  useEffect(() => { activeChallenge.value = step; }, [step]);

  // const handleVerificationSuccess = useRunOnJS((result: any) => {
  //   console.log("🏆 Match confirmed!");
  //   if (result.diagonise) setCroppedPreview(result.diagonise);
  //   setOutcome("success");
  // }, []);

  const handleVerificationSuccess = useRunOnJS((result: any) => {
    // 🎯 PRINT IDENTITY DETAILS AND VERDICT SCORE IN CONSOLE
    console.log(
      "🏆 [UI Thread - MATCH LOCKED SUCCESS]:",
      `\n  ├─ Enrolled Profile Name: ${user?.name || "Unknown Identity Account"}`,
      `\n  ├─ Vector Matching Confidence: ${(result.confidence * 100).toFixed(4)}%`,
      `\n  └─ Access Pipeline Status: Attendance recorded successfully.`
    );

    if (result.diagonise) setCroppedPreview(result.diagonise);
    setOutcome("success");
  }, [user]); // Added user dependency to read names securely across thread transitions

  const handleVerificationFailure = useRunOnJS((errorMessage: string) => {
    console.log("❌ Verification failed:", errorMessage);
    setErrorDetails(errorMessage);
    setOutcome("failed");
  }, []);

  const setLivePreviewOnUIThread = useRunOnJS((uri: string) => {
    setCroppedPreview(uri);
  }, []);

  const onVerify = () => {
    if (!faceDescriptor || outcome === "verifying") return;
    setOutcome("verifying");
    setErrorDetails(null);
  };
  
  const frameProcessor = useFrameProcessor((frame) => {
    "worklet";
    if (isCheckingFrame.value || !faceDescriptor || boxedMobileFaceModel == null) return;

    isCheckingFrame.value = true;

    try {
      const result = verifyFaceFrame({
        frame,
        enrolledFaceDescriptor: faceDescriptor,
        currentChallenge: activeChallenge.value,
        resizePlugin: resize,
        faceDetectorPlugin: detectFaces,
        boxedAntiSpoofInterpreter: {}, // Passing empty workspace placeholder object layout
        boxedMobileFaceInterpreter: boxedMobileFaceModel,
        user: user,
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
  }, [faceDescriptor, boxedMobileFaceModel, isCheckingFrame, activeChallenge, resize, detectFaces]);    

  const TypedCameraPreview = CameraPreview as any;
  return (
    <View className="flex-1 bg-black">
      <View className="absolute inset-0 z-10">
        <TypedCameraPreview device={device} hasPermission={hasPermission} isActive={isActive} frameProcessor={outcome === "verifying" ? frameProcessor : undefined} torch={outcome === "verifying" ? "on" : "off"}/>
        <FaceOverlay />
      </View>

      {/* ============================================================================= */}
      {/* 🌟 SPLIT-SCREEN PREVIEW PANELS: ENROLLED BASELINE REFERENCE VS LIVE EVALUATION */}
      {/* ============================================================================= */}

      {/* PANEL 1: ENROLLED IMAGE FROM THE DATABASE (LEFT SIDE) */}
      {user?.profileImage && (
        <View className="absolute top-36 left-6 z-50 border-2 border-blue-500 rounded-2xl overflow-hidden shadow-2xl bg-slate-900 p-2">
          <Text className="text-[10px] text-blue-500 font-bold text-center mb-1">ENROLLED BASELINE</Text>
          <Image source={{ uri: user.profileImage }} className="w-28 h-28 rounded-xl bg-black" resizeMode="contain" />
          <Text className="text-[10px] text-white text-center mt-1 font-semibold truncate w-28">{user.name}</Text>
        </View>
      )}

      {/* PANEL 2: CURRENT CAMERA LIVE STREAM TARGET MATRIX (RIGHT SIDE) */}
      {croppedPreview && (
        <View className="absolute top-36 right-6 z-50 border-2 border-amber-400 rounded-2xl overflow-hidden shadow-2xl bg-slate-900 p-2">
          <Text className="text-[10px] text-amber-400 font-bold text-center mb-1">WHAT THE MODEL SEES</Text>
          <Image source={{ uri: croppedPreview }} className="w-28 h-28 rounded-xl bg-black" resizeMode="contain" />
          <Text className="text-[10px] text-white text-center mt-1 font-semibold">Live stream</Text>
        </View>
      )}

      <View className="absolute left-0 right-0 z-40 px-6" style={{ top: Math.max(insets.top, 16) + 8 }} pointerEvents="box-none">
        <TouchableOpacity onPress={() => { if (outcome !== "verifying") setOutcome("idle"); }} disabled={outcome === "verifying"} className="mb-4 w-10">
          <MaterialCommunityIcons name="arrow-left" size={28} color="white" />
        </TouchableOpacity>
      </View>

      <LivenessPrompts step={step} />
      
      {outcome === "idle" && (
        <View className="absolute top-44 left-6 right-6 z-50 flex-row justify-around bg-black/40 p-2 rounded-xl">
          {(["blink", "smile", "turn"] as const).map((challenge) => (
            <TouchableOpacity key={challenge} onPress={() => setStep(challenge)} className={`px-3 py-1 rounded-lg ${step === challenge ? 'bg-white' : 'bg-transparent'}`}>
              <Text className={step === challenge ? 'text-black font-bold' : 'text-white'}>{challenge.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View className="absolute bottom-0 left-0 right-0 z-50 px-6 gap-4" style={{ paddingBottom: Math.max(insets.bottom, 24) }} pointerEvents="box-none">
        <Text className="text-center text-lg font-medium text-white shadow-sm mb-2 bg-black/50 p-2 rounded-xl">
          {errorDetails ? `❌ ${errorDetails}` : OUTCOME_MESSAGE[outcome]}
        </Text>
        <Button label={outcome === "verifying" ? "Analyzing face..." : "Verify Identity"} onPress={onVerify} disabled={outcome === "verifying"} />
      </View>
    </View>
  );
}