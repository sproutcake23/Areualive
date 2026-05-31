// Face verification / attendance capture. On an accepted match (above the
// confidence threshold + liveness confirmed) it writes an attendance record via
// lib/attendance.ts; the sync queue drains it to AWS later.
//
// Drives verification through the cameraInterface mock until the AI Team's
// plugin lands. The enrolled descriptor is already in memory (authStore/MMKV) —
// no SQLite reads on the camera screen (see Performance Rules).
import { useState } from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/common/Button";
import { CameraPreview } from "@/components/camera/CameraPreview";
import { FaceOverlay } from "@/components/camera/FaceOverlay";
import { LivenessPrompts } from "@/components/camera/LivenessPrompts";
import { useCameraSession } from "@/hooks/useCameraSession";
import { captureAttendance } from "@/lib/attendance";
import { mockVerifyFace } from "@/lib/cameraInterface";
import { config } from "@/constants/config";
import { useAuthStore } from "@/store/authStore";
import type { LivenessStep } from "@/types";

type Outcome = "idle" | "verifying" | "success" | "failed";

const OUTCOME_MESSAGE: Record<Outcome, string> = {
  idle: "Position your face in the frame, then verify.",
  verifying: "Verifying…",
  success: "Attendance recorded.",
  failed: "Verification failed. Try again.",
};

export default function Verify() {
  const { device, hasPermission, isActive } = useCameraSession();
  const user = useAuthStore((s) => s.user);
  const [outcome, setOutcome] = useState<Outcome>("idle");
  const [step, setStep] = useState<LivenessStep>(config.LIVENESS_STEPS[0]);

  const onVerify = async () => {
    if (!user || outcome === "verifying") return;
    setOutcome("verifying");

    // TODO: AI Team — replace mockVerifyFace() with verifyFaceFrame() driven by
    // the Frame Processor Plugin (live Frame + the enrolled descriptor).
    const result = await mockVerifyFace();
    if (result.livenessStep) setStep(result.livenessStep);

    const accepted =
      result.isMatch &&
      result.livenessConfirmed &&
      result.confidence >= config.MATCH_CONFIDENCE_THRESHOLD;

    if (accepted) {
      await captureAttendance(user.id, result);
      setOutcome("success");
    } else {
      setOutcome("failed");
    }
  };

  return (
    <View className="flex-1 bg-black">
      <CameraPreview
        device={device}
        hasPermission={hasPermission}
        isActive={isActive}
      />
      <FaceOverlay />
      <LivenessPrompts step={step} />
      <SafeAreaView style={{ flex: 1 }} pointerEvents="box-none">
        <View className="flex-1 justify-end gap-4 px-6 pb-8">
          <Text className="text-center text-lg font-medium text-white">
            {OUTCOME_MESSAGE[outcome]}
          </Text>
          <Button
            label="Verify"
            onPress={onVerify}
            disabled={outcome === "verifying"}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}
