// Face verification / attendance capture. On an accepted match (above the
// confidence threshold + liveness confirmed) it writes an attendance record via
// lib/attendance.ts; the sync queue drains it to AWS later.
//
// Drives verification through the cameraInterface mock until the AI Team's
// plugin lands. The enrolled descriptor is already in memory (authStore/MMKV) —
// no SQLite reads on the camera screen (see Performance Rules).
import { useState } from "react";
import { Text, View, TouchableOpacity } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

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
  const insets = useSafeAreaInsets();
  const [outcome, setOutcome] = useState<Outcome>("idle");
  const [step, setStep] = useState<LivenessStep>(config.LIVENESS_STEPS[0]);
  const [showCamera, setShowCamera] = useState(false);

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

  if (!showCamera) {
    return (
      <View className="flex-1 bg-[#eef2f6]">
        {/* Top Bar with Back Arrow */}
        <View 
          className="absolute left-0 right-0 z-50 px-6"
          style={{ top: Math.max(insets.top, 16) + 8 }}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              }
            }}
            activeOpacity={0.7}
            hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
            className="mb-4 w-10"
          >
            <MaterialCommunityIcons name="arrow-left" size={28} color="#0f172a" />
          </TouchableOpacity>
        </View>

        {/* Main Content Area */}
        <View 
          className="flex-1 px-6 pb-8"
          style={{ paddingTop: Math.max(insets.top, 16) + 64 }}
        >
          <TouchableOpacity 
            className="flex-1 overflow-hidden rounded-[40px] bg-white shadow-xl elevation-5 items-center justify-center"
            activeOpacity={0.9}
            onPress={() => setShowCamera(true)}
          >
            <View 
              className="items-center justify-center"
              style={{
                shadowColor: '#22c55e',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.8,
                shadowRadius: 20,
                elevation: 15,
                backgroundColor: 'transparent'
              }}
            >
              <MaterialCommunityIcons 
                name="face-recognition" 
                size={120} 
                color="#0f172a" 
              />
            </View>
            <Text className="mt-8 text-2xl font-medium text-[#0f172a]">
              Face scan
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      {/* Top Bar with Back Arrow for camera view */}
      <View 
        className="absolute left-0 right-0 z-50 px-6"
        style={{ top: Math.max(insets.top, 16) + 8 }}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          onPress={() => {
            if (outcome !== "verifying") {
              setShowCamera(false);
              setOutcome("idle");
            }
          }}
          disabled={outcome === "verifying"}
          activeOpacity={0.7}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
          className="mb-4 w-10"
        >
          <MaterialCommunityIcons name="arrow-left" size={28} color="white" />
        </TouchableOpacity>
      </View>

      <CameraPreview
        device={device}
        hasPermission={hasPermission}
        isActive={isActive}
      />
      <FaceOverlay />
      <LivenessPrompts step={step} />
      <SafeAreaView style={{ flex: 1 }} pointerEvents="box-none">
        <View className="flex-1 justify-end gap-4 px-6 pb-8">
          <Text className="text-center text-lg font-medium text-white shadow-sm mb-2">
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
