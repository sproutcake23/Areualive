// All shared TypeScript types live here.
//
// The camera↔model bridge contract types are owned by lib/cameraInterface.ts
// (the only file shared with the AI Model team) and re-exported here so app-dev
// code can import everything from "@/types".
export type {
  FaceVerificationInput,
  FaceVerificationResult,
  EnrollmentInput,
  EnrollmentResult,
} from "@/lib/cameraInterface";

// An attendance record as stored in expo-sqlite. See AGENTS.md → Local Data Model.
export type AttendanceRecord = {
  id: string; // UUID via expo-crypto, generated locally
  userId: string; // enrolled user ID
  timestamp: string; // ISO 8601
  confidence: number; // from FaceVerificationResult
  livenessConfirmed: boolean;
  synced: boolean; // false until successfully pushed to AWS
  syncedAt?: string; // ISO 8601, set after confirmed sync
};

// The enrolled field-person identity. Persisted via authStore (MMKV).
export type EnrolledUser = {
  id: string;
  name: string;
  enrolledAt: string; // ISO 8601
};

// Drives the always-visible sync status badge.
export type SyncStatus = "connected" | "offline" | "syncing";

// The liveness challenge currently presented to the user. Mirrors the optional
// livenessStep on FaceVerificationResult (owned by lib/cameraInterface.ts).
export type LivenessStep = "blink" | "smile" | "turn";
