// Non-interactive guide showing where to position the face. No clutter — a
// single oval outline, per UI Rules.
import { View } from "react-native";

export function FaceOverlay() {
  return (
    <View
      pointerEvents="none"
      className="absolute inset-0 items-center justify-center"
    >
      <View className="h-72 w-60 rounded-full border-2 border-white/70" />
    </View>
  );
}
