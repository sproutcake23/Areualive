import re

with open("app/verify.tsx", "r") as f:
    text = f.read()

parts = text.split('\nimport { useRouter } from "expo-router";')
if len(parts) != 2:
    print("Error splitting")
    exit(1)

commented_part = parts[0]
uncommented_part = '\nimport { useRouter } from "expo-router";' + parts[1]

# Now we rewrite the uncommented part completely.
new_uncommented = """
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
    case "running_inference": return "Analyzing…";
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
  
  const { boxedMobileFaceModel, isModelLoaded } = useGlobalModels();

  const handlePhaseAdvance = useRunOnJS((nextPhase: VerificationPhase) => {
    setPhase(nextPhase);
  }, []);

  const handleVerificationSuccess = useRunOnJS((result: any) => {
    console.log(
      "🏆 [UI Thread - MATCH LOCKED SUCCESS]:",
      `\\n  ├─ Enrolled Profile Name: ${user?.name || "Unknown Identity Account"}`,
      `\\n  ├─ Vector Matching Confidence: ${(result.confidence * 100).toFixed(4)}%`
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
          const nextPhase = currentP === "challenge_1" ? "challenge_2" : "awaiting_frontal";
          currentPhase.value = nextPhase;
          handlePhaseAdvance(nextPhase);
        }
      } else {
        challengeConfirmCount.value = 0;
      }
      return;
    }

    if (currentP === "awaiting_frontal") {
      const faces = detectFaces.detectFaces(frame);
      if (!faces || faces.length === 0) return;
      if (Math.abs(faces[0].yawAngle ?? 0) < config.FRONTAL_YAW_THRESHOLD_DEG) {
        currentPhase.value = "running_inference";
        handlePhaseAdvance("running_inference");
        // Fall through to inference
      } else {
        return;
      }
    }

    if (currentPhase.value === "running_inference") {
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
  }, [faceDescriptor, boxedMobileFaceModel, isCheckingFrame, challengePair, currentPhase, challengeConfirmCount, resize, detectFaces, cameraPosition, isFlashOn]);    

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
"""

with open("app/verify.tsx", "w") as f:
    f.write(commented_part + new_uncommented)
