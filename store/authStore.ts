// Enrolled user identity + face descriptor. Persisted via MMKV.
// See AGENTS.md → State Rules.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { mmkvStorage } from "@/lib/storage";
import type { EnrolledUser } from "@/types";

type AuthState = {
  user: EnrolledUser | null;
  faceDescriptor: number[] | null;
  isEnrolled: boolean;
  enroll: (user: EnrolledUser, faceDescriptor: number[]) => void;
  clearEnrollment: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      faceDescriptor: null,
      isEnrolled: false,
      enroll: (user, faceDescriptor) =>
        set({ user, faceDescriptor, isEnrolled: true }),
      clearEnrollment: () =>
        set({ user: null, faceDescriptor: null, isEnrolled: false }),
    }),
    {
      name: "auth-store",
      storage: createJSONStorage(() => mmkvStorage),
    }
  )
);
