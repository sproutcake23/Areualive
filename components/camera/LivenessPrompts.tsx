// Large, high-contrast liveness prompt shown above the camera frame. The pulse
// animation uses Reanimated (UI thread) so it never stutters while the JS thread
// is busy — see AGENTS.md → Animation rule.
import { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

type Props = {
  label: string;
};

export function LivenessPrompts({ label }: Props) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.4, { duration: 700 }), -1, true);
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (!label) return null;

  return (
    <View
      pointerEvents="none"
      className="absolute left-0 right-0 top-24 items-center"
    >
      <Animated.View
        style={animatedStyle}
        className="rounded-2xl bg-black/60 px-6 py-3"
      >
        <Text className="text-2xl font-semibold text-white">
          {label}
        </Text>
      </Animated.View>
    </View>
  );
}
