// Manages the Vision Camera lifecycle for the face screens: permission + device
// + active state. The actual frame processing (the AI Team's Frame Processor
// Plugin) attaches in the screen via the <Camera frameProcessor> prop — see
// components/camera/CameraPreview.tsx. This hook owns lifecycle only.
import { useEffect, useState } from "react";
import {
  useCameraDevice,
  useCameraPermission,
  type CameraDevice,
} from "react-native-vision-camera";

export type CameraSession = {
  device: CameraDevice | undefined;
  hasPermission: boolean;
  isActive: boolean;
  setActive: (active: boolean) => void;
};

// Front camera is used for face verification/enrollment. Permission is requested
// on mount if not already granted.
export function useCameraSession(): CameraSession {
  const device = useCameraDevice("front");
  const { hasPermission, requestPermission } = useCameraPermission();
  const [isActive, setActive] = useState(true);

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  return { device, hasPermission, isActive, setActive };
}
