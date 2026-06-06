import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import { router } from "expo-router";
import { useState, useMemo, useEffect } from "react";
import { Text, TextInput, TouchableOpacity, View, Image } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFrameProcessor } from "react-native-vision-camera";
import { useFaceDetector } from "react-native-vision-camera-face-detector";
import { useRunOnJS } from "react-native-worklets-core"; 
import { useResizePlugin } from "vision-camera-resize-plugin";
import { useTensorflowModel } from "react-native-fast-tflite";
import { NitroModules } from 'react-native-nitro-modules';

import { CameraPreview } from "@/components/camera/CameraPreview";
import { FaceOverlay } from "@/components/camera/FaceOverlay";
import { enrollFaceFrame } from "@/lib/cameraInterface"; 
import { useAuthStore } from "@/store/authStore";
import { useCameraSession } from "@/hooks/useCameraSession"; // 🌟 ADD THIS LINE!

export default function Enrollment() {
  const { device, hasPermission, isActive } = useCameraSession();
  const enroll = useAuthStore((s) => s.enroll);
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [enrollmentPreview, setEnrollmentPreview] = useState<string | null>(null);

  const faceDetector = useFaceDetector({ performanceMode: "fast" });
  const { resize } = useResizePlugin();

  const shouldCapture = useSharedValue(false);
  const isProcessing = useSharedValue(false);

  const canEnroll = name.trim().length > 0 && !busy;

  const faceNetPlugin = useTensorflowModel(require("../../assets/tflite/w600k_mbf_fixed_float32.tflite"), []);
  const faceNetModel = faceNetPlugin.state === 'loaded' ? faceNetPlugin.model : undefined;
  const boxedMobileFaceModel = useMemo(() => (faceNetModel != null ? NitroModules.box(faceNetModel as any) : undefined), [faceNetModel]);

  const setPreviewOnUIThread = useRunOnJS((uri: string) => {
    setEnrollmentPreview(uri);
  }, [setEnrollmentPreview]);

  const handleEnrollmentSuccess = useRunOnJS((faceDescriptor: number[], diagnoseUri?: string) => {
    try {
      enroll({
        id: Crypto.randomUUID(),
        name: name.trim(),
        enrolledAt: new Date().toISOString(),
        profileImage: diagnoseUri
      }, faceDescriptor);
      setBusy(false);
      router.replace("/verify");
    } catch (err) {
      setErrorMessage("Failed to commit identity storage.");
      setBusy(false);
    }
  }, [enroll, name]);

  const handleEnrollmentFailure = useRunOnJS((errorText: string) => {
    setErrorMessage(errorText);
    setBusy(false);
  }, []);

  const onCapture = () => {
    if (name.trim().length === 0 || busy) return;
    setErrorMessage(null);
    shouldCapture.value = true;
    setBusy(true);
  };

  const frameProcessor = useFrameProcessor((frame) => {
    "worklet";
    if (boxedMobileFaceModel == null || !shouldCapture.value || isProcessing.value) return;

    isProcessing.value = true;
    shouldCapture.value = false;

    try {
      const result = enrollFaceFrame({ 
        frame,
        resizePlugin: resize,
        faceDetectorPlugin: faceDetector,
        boxedMobileFaceInterpreter: boxedMobileFaceModel,
      });

      if (result.error || !result.faceDescriptor || result.faceDescriptor.length === 0) {
        isProcessing.value = false;
        if (result.diagnose) setPreviewOnUIThread(result.diagnose);
        handleEnrollmentFailure(result.error || "Vector mapping failed.");
      } else {
        isProcessing.value = false;
        if (result.diagnose) setPreviewOnUIThread(result.diagnose);
        handleEnrollmentSuccess(result.faceDescriptor, result.diagnose);
      }
    } catch (err: any) {
      isProcessing.value = false;
      handleEnrollmentFailure(err.message || "Native execution exception.");
    }
  }, [faceDetector, resize, shouldCapture, isProcessing, boxedMobileFaceModel]); 

  if (!showCamera) {
    return (
      <View className="flex-1 items-center justify-center bg-[#f0f4f8]">
        <TouchableOpacity onPress={() => setShowCamera(true)} className="items-center" activeOpacity={0.7}>
          <View className="mb-4 h-32 w-32 items-center justify-center rounded-3xl bg-white shadow-sm elevation-2">
            <MaterialCommunityIcons name="account-plus-outline" size={64} color="#0f172a" />
          </View>
          <Text className="text-xl font-medium text-slate-800">Add user</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const TypedCameraPreview = CameraPreview as any;
  return (
    <View className="flex-1 bg-black">
      <View className="absolute inset-0 z-10">
        <TypedCameraPreview device={device} hasPermission={hasPermission} isActive={isActive} frameProcessor={frameProcessor} torch={busy ? "on" : "off"}/>
        <FaceOverlay />
      </View>

      {enrollmentPreview && (
        <View className="absolute top-36 right-6 z-50 border-2 border-yellow-500 rounded-2xl overflow-hidden shadow-2xl bg-slate-900 p-2">
          <Text className="text-[10px] text-yellow-500 font-bold text-center mb-1">ENROLLMENT MATRIX VIEW</Text>
          <Image source={{ uri: enrollmentPreview }} className="w-28 h-28 rounded-xl bg-black" resizeMode="contain" />
        </View>
      )}
      
      <View className="absolute left-0 right-0 z-40 px-6" style={{ top: Math.max(insets.top, 16) + 8 }} pointerEvents="box-none">
        <TouchableOpacity onPress={() => { if (!busy) { setShowCamera(false); setName(""); setErrorMessage(null); } }} disabled={busy} activeOpacity={0.7} className="mb-4">
          <MaterialCommunityIcons name="arrow-left" size={28} color="white" />
        </TouchableOpacity>
        <Text className="text-2xl font-semibold text-white shadow-sm">Face registration</Text>
      </View>

      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 24, paddingBottom: Math.max(insets.bottom, 24), gap: 16, zIndex: 9999, elevation: 10 }} pointerEvents="box-none">
        {errorMessage && <Text className="text-center text-sm font-semibold text-red-500 bg-black/80 p-3 rounded-lg">{errorMessage}</Text>}
        <TextInput value={name} onChangeText={setName} editable={!busy} placeholder="Your name" placeholderTextColor="#9ca3af" className="rounded-xl bg-neutral-900 px-4 py-3.5 text-base text-white border border-neutral-800 shadow-xl" />
        <TouchableOpacity onPress={onCapture} disabled={!canEnroll} activeOpacity={0.7}>
          <View className="bg-blue-600 p-4 rounded-xl items-center justify-center shadow-2xl">
            <Text className="text-white text-base font-bold tracking-wide">{busy ? "Enrolling…" : "Register Face"}</Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}