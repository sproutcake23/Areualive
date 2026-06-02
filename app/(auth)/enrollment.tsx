// Biometric enrollment. Captures the field-person's face and stores their
// identity + descriptor via authStore (MMKV). Drives capture through the
// cameraInterface mock until the AI Team's plugin lands.
//
// Screen only composes components + calls the store; the enrollment business
// logic lives behind lib/cameraInterface.ts.
import { useState } from "react";
import { Text, TextInput, View, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Crypto from "expo-crypto";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { Button } from "@/components/common/Button";
import { CameraPreview } from "@/components/camera/CameraPreview";
import { FaceOverlay } from "@/components/camera/FaceOverlay";
import { useCameraSession } from "@/hooks/useCameraSession";
import { mockEnrollFace } from "@/lib/cameraInterface";
import { useAuthStore } from "@/store/authStore";

export default function Enrollment() {
  const { device, hasPermission, isActive } = useCameraSession();
  const enroll = useAuthStore((s) => s.enroll);
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [showCamera, setShowCamera] = useState(false);

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

  if (!showCamera) {
    return (
      <View className="flex-1 items-center justify-center bg-[#f0f4f8]">
        <TouchableOpacity
          onPress={() => setShowCamera(true)}
          className="items-center"
          activeOpacity={0.7}
        >
          <View className="mb-4 h-32 w-32 items-center justify-center rounded-3xl bg-white shadow-sm elevation-2">
            <MaterialCommunityIcons
              name="account-plus-outline"
              size={64}
              color="#0f172a"
            />
          </View>
          <Text className="text-xl font-medium text-slate-800">Add user</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <CameraPreview
        device={device}
        hasPermission={hasPermission}
        isActive={isActive}
      />
      <FaceOverlay />
      
      {/* Absolute top section matching design (arrow + title) */}
      <View 
        className="absolute left-0 right-0 z-50 px-6"
        style={{ top: Math.max(insets.top, 16) + 8 }}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          onPress={() => {
            if (!busy) {
              setShowCamera(false);
              setName("");
            }
          }}
          disabled={busy}
          activeOpacity={0.7}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
          className="mb-4"
        >
          <MaterialCommunityIcons name="arrow-left" size={28} color="white" />
        </TouchableOpacity>
        <Text className="text-2xl font-semibold text-white shadow-sm">
          Face registration
        </Text>
      </View>

      <View className="absolute bottom-0 left-0 right-0 z-50 justify-end gap-4 px-6 pb-8" pointerEvents="box-none" style={{ paddingBottom: Math.max(insets.bottom, 24) }}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor="#9ca3af"
          className="rounded-xl bg-neutral-800 px-4 py-3 text-base text-white"
        />
        <Button
          label={busy ? "Enrolling…" : "Registration completed"}
          onPress={onCapture}
          disabled={!canEnroll}
        />
      </View>
    </View>
  );
}
