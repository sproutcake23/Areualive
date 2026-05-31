// Near-full-screen camera preview. Handles the no-permission and no-device
// states with high-contrast text (field use in sunlight — see UI Rules).
//
// StyleSheet.absoluteFill is used for the native <Camera> fill (a permitted
// StyleSheet exception — NativeWind classNames are unreliable on the native
// camera view).
import { StyleSheet, Text, View } from "react-native";
import { Camera, type CameraDevice } from "react-native-vision-camera";

type Props = {
  device: CameraDevice | undefined;
  hasPermission: boolean;
  isActive: boolean;
};

export function CameraPreview({ device, hasPermission, isActive }: Props) {
  if (!hasPermission) {
    return (
      <View className="flex-1 items-center justify-center bg-black px-6">
        <Text className="text-center text-lg text-neutral-100">
          Camera permission is required to verify your identity.
        </Text>
      </View>
    );
  }

  if (!device) {
    return (
      <View className="flex-1 items-center justify-center bg-black">
        <Text className="text-lg text-neutral-100">No camera available.</Text>
      </View>
    );
  }

  // TODO: AI Team — attach the Frame Processor Plugin here via the
  // `frameProcessor` prop (useFrameProcessor calling verifyFaceFrame). Until the
  // plugin lands, the screens drive verification through the cameraInterface mocks.
  return (
    <Camera style={StyleSheet.absoluteFill} device={device} isActive={isActive} />
  );
}
