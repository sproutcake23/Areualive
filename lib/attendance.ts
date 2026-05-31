// Turns a successful face verification into a persisted attendance record.
// This is the glue between the camera/verification flow and the sync queue —
// screens call captureAttendance(); they never build records or touch SQLite
// directly (see AGENTS.md → "screens only compose").
import * as Crypto from "expo-crypto";

import { insertAttendanceRecords } from "@/lib/db";
import type { AttendanceRecord, FaceVerificationResult } from "@/types";

// Builds an unsynced AttendanceRecord from a verification result and writes it.
// The foreground hook (useSyncQueue) and background task drain it to AWS later.
export async function captureAttendance(
  userId: string,
  result: FaceVerificationResult
): Promise<AttendanceRecord> {
  const record: AttendanceRecord = {
    id: Crypto.randomUUID(), // local UUID, generated offline
    userId,
    timestamp: new Date().toISOString(),
    confidence: result.confidence,
    livenessConfirmed: result.livenessConfirmed,
    synced: false,
  };

  await insertAttendanceRecords([record]);
  return record;
}
