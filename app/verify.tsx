// [commented-out old code block omitted for brevity — preserved in git history]

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
import { checkChallenge, verifyFaceFrame } from "@/lib/cameraInterface";
import { useAuthStore } from "@/store/authStore";
import type { LivenessStep, VerificationPhase } from "@/types";
import * as Brightness from "expo-brightness";
import { useGlobalModels } from "../context/ModelContext";

// =============================================================================
// CONSTANTS
// =============================================================================

const PROMPT_LABELS: Record<string, string> = {
  blink: "Blink your eyes",
  smile: "Smile",
  turn: "Turn your head",
};

const getPhaseMessage = (
  phase: VerificationPhase,
  challengePair: LivenessStep[],
  inferenceFrame: number
): string => {
  switch (phase) {
    case "idle":
      return "Position your face, then tap Verify.";
    case "challenge_1":
      return challengePair[0] ? PROMPT_LABELS[challengePair[0]] : "";
    case "challenge_2":
      return challengePair[1] ? PROMPT_LABELS[challengePair[1]] : "";
    case "running_inference":
      return `Scanning… (${inferenceFrame}/${config.INFERENCE_FRAME_LIMIT})`;
    case "success":
      return "Attendance recorded.";
    case "failed":
      return "Verification failed.";
    default:
      return "";
  }
};

// =============================================================================
// COMPONENT
// =============================================================================

export default function Verify() {
  const { device: defaultDevice, hasPermission, isActive } = useCameraSession();
  const user = useAuthStore((s) => s.user);
  const faceDescriptor = useAuthStore((s) => s.faceDescriptor);

  const insets = useSafeAreaInsets();

  // ─── FIX 1: Wrap detectFaces in useRef ──────────────────────────────────────
  // useFaceDetector returns a new object reference on every render.
  // Putting it in a ref means the worklet dependency array always sees the same
  // reference, so useFrameProcessor is NEVER rebuilt due to this changing.
  const detectFacesInstance = useFaceDetector({
    performanceMode: "fast",
    landmarkMode: "all",
    classificationMode: "all",
  });
  const detectFacesRef = useRef(detectFacesInstance);
  // Note: detectFacesRef.current never changes — the ref is stable forever.
  // The underlying detector object is also stable (useFaceDetector is idempotent),
  // so this is safe. We do NOT update the ref on re-renders intentionally.

  // ─── FIX 2: Wrap resize in useRef ───────────────────────────────────────────
  // useResizePlugin also returns a new function reference on every render.
  // Same treatment — freeze it into a ref so the dep array stays stable.
  const { resize: resizeInstance } = useResizePlugin();
  const resizeRef = useRef(resizeInstance);

  // ─── FIX 3: Wrap boxedMobileFaceModel in useRef ─────────────────────────────
  // useGlobalModels() may return a new object reference if the context
  // re-renders. Freeze it the same way.
  const { boxedMobileFaceModel: boxedModelInstance } = useGlobalModels();
  const boxedModelRef = useRef(boxedModelInstance);

  const [cameraPosition, setCameraPosition] = useState<"front" | "back">("front");
  const [isFlashOn, setIsFlashOn] = useState(false);

  const [phase, setPhase] = useState<VerificationPhase>("idle");
  const [challengePairState, setChallengePairState] = useState<LivenessStep[]>([]);
  const [croppedPreview, setCroppedPreview] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);

  // Tracks current inference frame count for UI display only.
  // Updated via throttled shared value — NOT on every frame.
  const [inferenceFrameDisplay, setInferenceFrameDisplay] = useState(0);

  const initialBrightness = useRef<number>(0.5);

  // isVerifying: any phase that is not a terminal state.
  const isVerifying =
    phase !== "idle" && phase !== "success" && phase !== "failed";

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

  // =============================================================================
  // SHARED VALUES (worklet-readable, updated on native thread)
  // =============================================================================

  const isCheckingFrame = useSharedValue(false);
  const challengePair = useSharedValue<LivenessStep[]>([]);
  const currentPhase = useSharedValue<VerificationPhase>("idle");
  const challengeConfirmCount = useSharedValue(0);
  const inferenceFrameCount = useSharedValue(0);

  // ─── FIX 4: Throttle counter for preview and UI display updates ─────────────
  // This shared value counts frames since the last JS thread update.
  // JS state updates fire at most once every 15 frames (~2x per second at 30fps)
  // instead of every single frame. This eliminates the re-render storm that was
  // causing useFrameProcessor to rebuild and restart the 100-frame loop.
  const jsUpdateThrottle = useSharedValue(0);

  // =============================================================================
  // JS THREAD CALLBACKS (called from worklet via useRunOnJS)
  // =============================================================================

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
  }, [user]);

  const handleVerificationFailure = useRunOnJS((errorMessage: string) => {
    console.log("❌ Verification failed:", errorMessage);
    setErrorDetails(errorMessage);
    setPhase("failed");
  }, []);

  // ─── FIX 4 cont: Throttled UI updater ──────────────────────────────────────
  // Receives both the preview image AND the frame count in one call.
  // One JS state batch instead of two separate calls per frame.
  const updateUIThrottled = useRunOnJS(
    (previewUri: string | null, frameCount: number) => {
      if (previewUri) setCroppedPreview(previewUri);
      setInferenceFrameDisplay(frameCount);
    },
    []
  );

  // =============================================================================
  // SESSION START
  // =============================================================================

  const onVerify = () => {
    if (!faceDescriptor || isVerifying) return;

    const pool: LivenessStep[] = ["blink", "smile", "turn"];
    const shuffled = pool.sort(() => Math.random() - 0.5).slice(0, 2);

    // Reset all shared values FIRST before opening the gate.
    challengePair.value = shuffled;
    challengeConfirmCount.value = 0;
    inferenceFrameCount.value = 0;
    isCheckingFrame.value = false;
    jsUpdateThrottle.value = 0;
    currentPhase.value = "challenge_1";

    // Then update React state.
    setChallengePairState(shuffled);
    setErrorDetails(null);
    setCroppedPreview(null);
    setInferenceFrameDisplay(0);
    setPhase("challenge_1");
  };

  // =============================================================================
  // FRAME PROCESSOR
  //
  // Phase flow: challenge_1 → challenge_2 → running_inference → success | failed
  //
  // KEY STABILITY RULES:
  // - detectFacesRef, resizeRef, boxedModelRef are stable refs — they NEVER
  //   change reference across renders, so they are NOT in the dep array.
  //   This means React will never see a dep change and rebuild this worklet
  //   during an active inference session.
  // - JS state updates (preview image, frame counter) are throttled to fire
  //   at most once every 15 frames via jsUpdateThrottle.
  // - The worklet NEVER calls handleVerificationFailure for individual frame
  //   errors. Only frame budget exhaustion ends the session.
  // =============================================================================

  const frameProcessor = useFrameProcessor(
    (frame) => {
      "worklet";

      // Use .current on all refs — stable reference, never causes dep change.
      const detectFaces = detectFacesRef.current;
      const resize = resizeRef.current;
      const boxedMobileFaceModel = boxedModelRef.current;

      if (!faceDescriptor || boxedMobileFaceModel == null) return;

      // Snapshot phase once per frame to avoid TOCTOU races.
      const currentP = currentPhase.value;

      // ─── PHASE: LIVENESS CHALLENGES ──────────────────────────────────────────
      if (currentP === "challenge_1" || currentP === "challenge_2") {
        const faces = detectFaces.detectFaces(frame);

        // No face — wait. Do NOT reset confirm count so brief face-loss
        // doesn't make the user redo their blink/smile/turn from scratch.
        if (!faces || faces.length === 0) return;
        if (!challengePair.value || challengePair.value.length < 2) return;

        const challengeIndex = currentP === "challenge_1" ? 0 : 1;
        const challenge = challengePair.value[challengeIndex];
        const passed = checkChallenge(faces[0], challenge);

        if (passed) {
          challengeConfirmCount.value += 1;

          if (challengeConfirmCount.value >= config.LIVENESS_CHALLENGE_CONFIRM_FRAMES) {
            challengeConfirmCount.value = 0;

            if (currentP === "challenge_1") {
              console.log(`[Liveness] ✅ Challenge 1 (${challenge}) confirmed.`);
              currentPhase.value = "challenge_2";
              handlePhaseAdvance("challenge_2");
              return; // MUST return — never fall through.
            } else {
              console.log(`[Liveness] ✅ Challenge 2 (${challenge}) confirmed. Opening inference gate.`);
              currentPhase.value = "running_inference";
              handlePhaseAdvance("running_inference");
              return; // MUST return — inference starts on NEXT clean frame.
            }
          }
          return; // Need more confirm frames.
        } else {
          challengeConfirmCount.value = 0;
          return;
        }
      }

      // ─── PHASE: FACE RECOGNITION ─────────────────────────────────────────────
      // NEVER exits back to challenges.
      // Only exits: frame budget exhausted → failed, or similarity match → success.
      // Every other outcome (no face, error, mismatch) just releases the lock.
      if (currentP === "running_inference") {

        // Prevent overlapping TFLite calls.
        if (isCheckingFrame.value) return;

        // Check budget BEFORE attempting inference.
        if (inferenceFrameCount.value >= config.INFERENCE_FRAME_LIMIT) {
          currentPhase.value = "failed";
          handleVerificationFailure(
            `No match found after ${config.INFERENCE_FRAME_LIMIT} attempts.`
          );
          return;
        }

        // Lock the inference lane.
        isCheckingFrame.value = true;
        inferenceFrameCount.value += 1;

        // ─── FIX 4: Throttle all JS updates to once every 15 frames ───────────
        // This is the core fix for the re-render storm. Instead of calling
        // setLivePreviewOnUIThread + updateInferenceFrameDisplay on every single
        // frame (causing React to re-render → detectFaces ref changes →
        // useFrameProcessor rebuilds → 100-frame loop resets), we only push
        // a UI update every 15 frames. The inference loop itself runs at full
        // camera speed — only the UI panel refreshes are throttled.
        jsUpdateThrottle.value += 1;
        const shouldUpdateUI = jsUpdateThrottle.value % 15 === 0;

        console.log(`[Inference] 🔍 Frame ${inferenceFrameCount.value}/${config.INFERENCE_FRAME_LIMIT}`);

        try {
          const result = verifyFaceFrame({
            frame,
            enrolledFaceDescriptor: faceDescriptor,
            currentChallenge: "blink", // Unused — kept for type compatibility.
            resizePlugin: resize,
            faceDetectorPlugin: detectFaces,
            boxedMobileFaceInterpreter: boxedMobileFaceModel,
            user: user,
            cameraPosition: cameraPosition,
            isFlashOn: isFlashOn,
          });

          if (result.isMatch && result.livenessConfirmed) {
            // ✅ SUCCESS
            console.log(`[Inference] 🎉 Match! Similarity: ${(result.confidence * 100).toFixed(2)}%`);
            currentPhase.value = "success";
            handleVerificationSuccess(result);
            // isCheckingFrame intentionally NOT reset — session is over.
            return;
          }

          // Non-success frame: log, throttled UI update, release lock.
          if (result.error) {
            console.log(`[Inference] ⚠️ Frame ${inferenceFrameCount.value} skipped: ${result.error}`);
          } else {
            console.log(`[Inference] ❌ Frame ${inferenceFrameCount.value} mismatch. Similarity: ${(result.confidence * 100).toFixed(2)}%`);
          }

          // Only push the preview image and frame counter to React
          // when the throttle fires — not on every frame.
          if (shouldUpdateUI) {
            updateUIThrottled(result.diagonise ?? null, inferenceFrameCount.value);
          }

          // Release lock — next frame can attempt inference.
          isCheckingFrame.value = false;

        } catch (err: any) {
          // Native crash on this frame. Log and release lock.
          // Frame budget handles ultimate failure — do NOT call handleVerificationFailure.
          console.log(`[Inference] 💥 Frame ${inferenceFrameCount.value} exception: ${err.message || err}`);
          isCheckingFrame.value = false;
        }

        return;
      }
    },
    [
      // ─── STABLE DEPS ONLY ───────────────────────────────────────────────────
      // detectFacesRef, resizeRef, boxedModelRef are intentionally NOT here.
      // They are refs — their .current values are accessed inside the worklet
      // but the refs themselves never change reference, so React never sees
      // a dep change and never rebuilds the frame processor mid-session.
      //
      // cameraPosition and isFlashOn ARE here because they are plain state
      // values that the worklet reads. If the user flips the camera or flash
      // mid-session, we want the worklet to use the new value. The re-build
      // this causes is acceptable — it only happens on deliberate user action,
      // not on every mismatch frame.
      faceDescriptor,
      isCheckingFrame,
      challengePair,
      currentPhase,
      challengeConfirmCount,
      inferenceFrameCount,
      jsUpdateThrottle,
      cameraPosition,
      isFlashOn,
      user,
      handlePhaseAdvance,
      handleVerificationSuccess,
      handleVerificationFailure,
      updateUIThrottled,
    ]
  );

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
            torch={
              cameraPosition === "back" && isFlashOn && isVerifying
                ? "on"
                : "off"
            }
          />
        )}
        {!(isVerifying && cameraPosition === "front" && isFlashOn) && (
          <FaceOverlay />
        )}
      </View>

      {/* Softbox flash mask */}
      {isVerifying && cameraPosition === "front" && isFlashOn && (
        <View
          pointerEvents="none"
          className="absolute inset-0 z-20 bg-white flex justify-center items-center"
        >
          <View
            className="w-72 h-72 rounded-full border-[600px] border-white bg-transparent absolute"
            style={{ transform: [{ scale: 1.2 }] }}
          />
          <Text className="text-slate-800 font-bold tracking-widest text-sm absolute top-24">
            LOOK HERE • SCANNING LIVENESS
          </Text>
        </View>
      )}

      {/* Top-right controls */}
      <View className="absolute top-12 right-6 z-50 flex-row gap-3">
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setIsFlashOn(!isFlashOn)}
          className={`px-4 py-2.5 rounded-full border ${
            isFlashOn
              ? "bg-amber-500 border-amber-400"
              : "bg-slate-900/80 border-slate-800"
          }`}
        >
          <Text
            className={`font-bold text-xs tracking-wider ${
              isFlashOn ? "text-slate-950" : "text-white"
            }`}
          >
            {isFlashOn ? "⚡ FLASH: ON" : "⚡ FLASH: OFF"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() =>
            setCameraPosition(cameraPosition === "front" ? "back" : "front")
          }
          className="bg-slate-900/80 px-4 py-2.5 rounded-full border border-slate-800"
        >
          <Text className="text-white font-bold text-xs tracking-wider">
            🔄 {cameraPosition === "front" ? "FRONT" : "BACK"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Back button */}
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => router.back()}
        className="absolute top-12 left-6 z-50 bg-slate-900/80 px-4 py-2.5 rounded-full border border-slate-800"
      >
        <Text className="text-white font-medium text-xs tracking-wider">
          ← MENU
        </Text>
      </TouchableOpacity>

      {/* Enrolled baseline preview */}
      {user?.profileImage && (
        <View className="absolute top-36 left-6 z-50 border-2 border-blue-500 rounded-2xl overflow-hidden shadow-2xl bg-slate-900 p-2">
          <Text className="text-[10px] text-blue-500 font-bold text-center mb-1">
            ENROLLED BASELINE
          </Text>
          <Image
            source={{ uri: user.profileImage }}
            className="w-28 h-28 rounded-xl bg-black"
            resizeMode="contain"
          />
          <Text className="text-[10px] text-white text-center mt-1 font-semibold truncate w-28">
            {user.name}
          </Text>
        </View>
      )}

      {/* Live inference preview — updates ~2x per second during inference */}
      {croppedPreview && (
        <View className="absolute top-36 right-6 z-50 border-2 border-amber-400 rounded-2xl overflow-hidden shadow-2xl bg-slate-900 p-2">
          <Text className="text-[10px] text-amber-400 font-bold text-center mb-1">
            WHAT THE MODEL SEES
          </Text>
          <Image
            source={{ uri: croppedPreview }}
            className="w-28 h-28 rounded-xl bg-black"
            resizeMode="contain"
          />
          <Text className="text-[10px] text-white text-center mt-1 font-semibold">
            Live stream
          </Text>
        </View>
      )}

      {/* Liveness prompt overlays */}
      {phase === "challenge_1" && challengePairState[0] && (
        <LivenessPrompts label={PROMPT_LABELS[challengePairState[0]] ?? ""} />
      )}
      {phase === "challenge_2" && challengePairState[1] && (
        <LivenessPrompts label={PROMPT_LABELS[challengePairState[1]] ?? ""} />
      )}

      {/* Bottom status bar */}
      <View
        className="absolute bottom-0 left-0 right-0 z-50 px-6 gap-4"
        style={{ paddingBottom: Math.max(insets.bottom, 24) }}
        pointerEvents="box-none"
      >
        <Text className="text-center text-lg font-medium text-white shadow-sm mb-2 bg-black/50 p-2 rounded-xl">
          {errorDetails
            ? `❌ ${errorDetails}`
            : getPhaseMessage(phase, challengePairState, inferenceFrameDisplay)}
        </Text>
        <Button
          label={isVerifying ? "Analyzing face..." : "Verify Identity"}
          onPress={onVerify}
          disabled={isVerifying}
        />
      </View>
    </View>
  );
}