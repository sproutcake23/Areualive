// AWS upload + purge logic. The ONLY place AWS calls are made — screens and
// components never call fetch directly. See AGENTS.md → Secret Rules / Sync Flow.
//
// Uses plain native fetch against the API Gateway endpoint (no AWS SDK) to keep
// the bundle lean.
import {
  getUnsyncedRecords,
  markRecordSynced,
  purgeSyncedRecords,
  countUnsyncedRecords,
} from "@/lib/db";
import { config } from "@/constants/config";
import type { AttendanceRecord } from "@/types";

export type SyncOutcome = {
  uploaded: number; // records confirmed (HTTP 200) and marked synced
  remaining: number; // records still unsynced after this run
};

// POSTs one record to AWS. Resolves true only on HTTP 200 — never on timeout,
// network error, or any other status. This gate protects the purge rule.
async function uploadRecord(record: AttendanceRecord): Promise<boolean> {
  if (!config.SYNC_ENDPOINT) return false;
  try {
    const response = await fetch(config.SYNC_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });
    return response.status === 200;
  } catch {
    return false;
  }
}

// Syncs all pending records. Shared by foreground (useSyncQueue) and background
// (syncTask) paths — do not duplicate this logic elsewhere.
//
// Purge rule: a record is deleted only after AWS returns HTTP 200 for that
// specific record. We mark each confirmed record synced, then purge only rows
// already marked synced. Unconfirmed records stay untouched for the next run.
export async function syncPendingRecords(): Promise<SyncOutcome> {
  const pending = await getUnsyncedRecords();

  let uploaded = 0;
  for (const record of pending) {
    const confirmed = await uploadRecord(record);
    if (!confirmed) continue;
    await markRecordSynced(record.id, new Date().toISOString());
    uploaded += 1;
  }

  // Only ever deletes rows already marked synced (HTTP 200 confirmed above).
  await purgeSyncedRecords();

  const remaining = await countUnsyncedRecords();
  return { uploaded, remaining };
}
