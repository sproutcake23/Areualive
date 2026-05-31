// Shared primary button. Plain NativeWind; no business logic.
import { Pressable, Text } from "react-native";

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

export function Button({ label, onPress, disabled = false }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`items-center rounded-xl px-6 py-4 ${
        disabled ? "bg-neutral-700" : "bg-blue-600 active:bg-blue-700"
      }`}
    >
      <Text className="text-base font-semibold text-white">{label}</Text>
    </Pressable>
  );
}
