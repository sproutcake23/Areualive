// Biometric enrollment. Captures the field-person's face and stores their
// identity + descriptor via authStore (MMKV). Drives capture through the
// cameraInterface mock until the AI Team's plugin lands.
//
// Screen only composes components + calls the store; the enrollment business
// logic lives behind lib/cameraInterface.ts.
import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Crypto from "expo-crypto";

import { Button } from "@/components/common/Button";
import { CameraPreview } from "@/components/camera/CameraPreview";
import { FaceOverlay } from "@/components/camera/FaceOverlay";
import { useCameraSession } from "@/hooks/useCameraSession";
import { mockEnrollFace } from "@/lib/cameraInterface";
import { useAuthStore } from "@/store/authStore";

export default function Enrollment() {
  const { device, hasPermission, isActive } = useCameraSession();
  const enroll = useAuthStore((s) => s.enroll);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const canEnroll = name.trim().length > 0 && !busy;

  const onCapture = async () => {
    if (!canEnroll) return;
    setBusy(true);
    try {
      // TODO: AI Team — replace mockEnrollFace() with a captured Frame passed to
      // enrollFaceFrame() once the Frame Processor Plugin is available.
      const { faceDescriptor, error } = await mockEnrollFace();
      if (error) return;
      enroll(
        {
          id: Crypto.randomUUID(),
          name: name.trim(),
          enrolledAt: new Date().toISOString(),
        },
        faceDescriptor
      );
      router.replace("/verify");
    } finally {
      setBusy(false);
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
      <SafeAreaView style={{ flex: 1 }} pointerEvents="box-none">
        <View className="flex-1 justify-end gap-4 px-6 pb-8">
          <Text className="text-center text-xl font-semibold text-white">
            Enroll your face
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor="#9ca3af"
            className="rounded-xl bg-neutral-800 px-4 py-3 text-base text-white"
          />
          <Button
            label={busy ? "Enrolling…" : "Capture & Enroll"}
            onPress={onCapture}
            disabled={!canEnroll}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}
