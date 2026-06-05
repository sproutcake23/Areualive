// // Near-full-screen camera preview. Handles the no-permission and no-device
// // states with high-contrast text (field use in sunlight — see UI Rules).
// //
// // StyleSheet.absoluteFill is used for the native <Camera> fill (a permitted
// // StyleSheet exception — NativeWind classNames are unreliable on the native
// // camera view).
// import { StyleSheet, Text, View } from "react-native";
// import { Camera, type CameraDevice } from "react-native-vision-camera";

// type Props = {
//   device: CameraDevice | undefined;
//   hasPermission: boolean;
//   isActive: boolean;
// };

// export function CameraPreview({ device, hasPermission, isActive }: Props) {
//   if (!hasPermission) {
//     return (
//       <View className="flex-1 items-center justify-center bg-black px-6">
//         <Text className="text-center text-lg text-neutral-100">
//           Camera permission is required to verify your identity.
//         </Text>
//       </View>
//     );
//   }

//   if (!device) {
//     return (
//       <View className="flex-1 items-center justify-center bg-black">
//         <Text className="text-lg text-neutral-100">No camera available.</Text>
//       </View>
//     );
//   }

//   // TODO: AI Team — attach the Frame Processor Plugin here via the
//   // `frameProcessor` prop (useFrameProcessor calling verifyFaceFrame). Until the
//   // plugin lands, the screens drive verification through the cameraInterface mocks.
//   return (
//     <Camera style={StyleSheet.absoluteFill} device={device} isActive={isActive} />
//   );
// }


// Near-full-screen camera preview. Handles the no-permission and no-device
// states with high-contrast text (field use in sunlight — see UI Rules).
//
// StyleSheet.absoluteFill is used for the native <Camera> fill (a permitted
// StyleSheet exception — NativeWind classNames are unreliable on the native
// camera view).
// import { StyleSheet, Text, View } from "react-native";
// // 🎯 Added type definition import for the background thread runner
// import { Camera, type CameraDevice, type ReadonlyFrameProcessor } from "react-native-vision-camera";

// type Props = {
//   device: CameraDevice | undefined;
//   hasPermission: boolean;
//   isActive: boolean;
//   frameProcessor?: ReadonlyFrameProcessor; // 🎯 Added optional frame processor prop interface
// };

// export function CameraPreview({ device, hasPermission, isActive, frameProcessor }: Props) {
//   if (!hasPermission) {
//     return (
//       <View className="flex-1 items-center justify-center bg-black px-6">
//         <Text className="text-center text-lg text-neutral-100">
//           Camera permission is required to verify your identity.
//         </Text>
//       </View>
//     );
//   }

//   if (!device) {
//     return (
//       <View className="flex-1 items-center justify-center bg-black">
//         <Text className="text-lg text-neutral-100">No camera available.</Text>
//       </View>
//     );
//   }

//   return (
//     <Camera 
//       style={StyleSheet.absoluteFill} 
//       device={device} 
//       isActive={isActive} 
//       pixelFormat="yuv" // 🎯 CRITICAL: Transforms native camera data stream to RGB arrays for TFLite
//       frameProcessor={frameProcessor} // 🎯 Connects the live execution worklet loop
//     />
//   );
// }

import { Camera, type CameraProps } from "react-native-vision-camera";

interface PreviewProps {
  device: any;
  hasPermission: boolean;
  isActive: boolean;
  frameProcessor: any;
}

export function CameraPreview({ device, hasPermission, isActive, frameProcessor }: PreviewProps) {
  if (!hasPermission || !device) return null;

  return (
    <Camera
      style={{ flex: 1 }}
      device={device}
      isActive={isActive}
      // 🎯 CRITICAL CONFIGURATION PINS FOR ANDROID FRAME SCANNING
      frameProcessor={frameProcessor} 
      pixelFormat="yuv" // 💡 Natively required for face-detector background processing
      enableFpsGraph={false}
    />
  );
}