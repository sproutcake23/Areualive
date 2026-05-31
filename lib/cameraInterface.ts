// THE BRIDGE between App Dev and the AI Model team.
//
// This is the ONLY file shared across the two ownership zones. App-dev code
// calls the exported functions; it never calls model code directly. The AI
// Team implements verifyFaceFrame / enrollFaceFrame as Vision Camera Frame
// Processor Plugins (native-thread worklets).
//
// Do not change the function signatures without coordinating both teams and
// updating types/index.ts together. See AGENTS.md → The Camera–Model Bridge.
import type { Frame } from "react-native-vision-camera";

import { config } from "@/constants/config";

export type FaceVerificationInput = {
  frame: Frame; // Vision Camera frame (native thread)
  enrolledFaceDescriptor: number[]; // stored during enrollment, from MMKV
};

export type FaceVerificationResult = {
  isMatch: boolean;
  livenessConfirmed: boolean;
  confidence: number; // 0.0 – 1.0
  livenessStep?: "blink" | "smile" | "turn"; // current liveness challenge state
  error?: string;
};

// TODO: AI Team — implement as a Vision Camera Frame Processor Plugin.
// This runs on the native thread as a worklet. Do not use async/await here.
export function verifyFaceFrame(
  input: FaceVerificationInput
): FaceVerificationResult {
  "worklet";
  // Placeholder — replace with TFLite frame processor plugin.
  throw new Error("verifyFaceFrame() not yet implemented by AI Team");
}

export type EnrollmentInput = {
  frame: Frame; // single captured frame for enrollment
};

export type EnrollmentResult = {
  faceDescriptor: number[]; // embedding — store in MMKV via authStore
  error?: string;
};

// TODO: AI Team — implement enrollment frame processing.
export function enrollFaceFrame(input: EnrollmentInput): EnrollmentResult {
  "worklet";
  throw new Error("enrollFaceFrame() not yet implemented by AI Team");
}

// ─── MOCKS (App Dev only — delete once the AI Team plugin lands) ──────────────
//
// These let us build and test UI before the model exists. They are plain async
// functions, NOT worklets — never call them from a frame processor. They take no
// Frame because there is nothing to process yet. See AGENTS.md → Coordination.

export async function mockVerifyFace(): Promise<FaceVerificationResult> {
  await new Promise((resolve) =>
    setTimeout(resolve, config.MOCK_INFERENCE_DELAY_MS)
  );
  return {
    isMatch: true,
    livenessConfirmed: true,
    confidence: 0.97,
    livenessStep: "blink",
  };
}

export async function mockEnrollFace(): Promise<EnrollmentResult> {
  await new Promise((resolve) =>
    setTimeout(resolve, config.MOCK_INFERENCE_DELAY_MS)
  );
  // A fake 128-dimension descriptor so storage/enrollment flows can be exercised.
  return {
    faceDescriptor: Array.from({ length: 128 }, () => 0),
  };
}
