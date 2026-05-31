// Entry point: redirect based on enrollment state. No UI of its own.
import { Redirect } from "expo-router";

import { useAuthStore } from "@/store/authStore";

export default function Index() {
  const isEnrolled = useAuthStore((s) => s.isEnrolled);
  return <Redirect href={isEnrolled ? "/verify" : "/enrollment"} />;
}
