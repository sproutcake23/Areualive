// expo-sqlite helpers for the attendance records table.
//
// WAL mode + synchronous=NORMAL are set once on open (required — see AGENTS.md).
// Booleans are stored as 0/1 integers and mapped back in rowToRecord.
import * as SQLite from "expo-sqlite";
import type { AttendanceRecord } from "@/types";

let dbInstance: SQLite.SQLiteDatabase | null = null;

// Opens (once) and returns the shared database handle.
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) return dbInstance;

  const db = await SQLite.openDatabaseAsync("datalake.db");
  await db.execAsync("PRAGMA journal_mode = WAL");
  await db.execAsync("PRAGMA synchronous = NORMAL");
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS attendance (
      id TEXT PRIMARY KEY NOT NULL,
      userId TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      confidence REAL NOT NULL,
      livenessConfirmed INTEGER NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0,
      syncedAt TEXT
    );
  `);

  dbInstance = db;
  return db;
}

type AttendanceRow = {
  id: string;
  userId: string;
  timestamp: string;
  confidence: number;
  livenessConfirmed: number;
  synced: number;
  syncedAt: string | null;
};

function rowToRecord(row: AttendanceRow): AttendanceRecord {
  return {
    id: row.id,
    userId: row.userId,
    timestamp: row.timestamp,
    confidence: row.confidence,
    livenessConfirmed: row.livenessConfirmed === 1,
    synced: row.synced === 1,
    syncedAt: row.syncedAt ?? undefined,
  };
}

// Batch insert inside a single transaction. Never write records one by one
// outside a transaction. See AGENTS.md → Performance Rules.
export async function insertAttendanceRecords(
  records: AttendanceRecord[]
): Promise<void> {
  if (records.length === 0) return;
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    for (const r of records) {
      await db.runAsync(
        "INSERT INTO attendance (id, userId, timestamp, confidence, livenessConfirmed, synced, syncedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          r.id,
          r.userId,
          r.timestamp,
          r.confidence,
          r.livenessConfirmed ? 1 : 0,
          r.synced ? 1 : 0,
          r.syncedAt ?? null,
        ]
      );
    }
  });
}

export async function getUnsyncedRecords(): Promise<AttendanceRecord[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<AttendanceRow>(
    "SELECT * FROM attendance WHERE synced = 0 ORDER BY timestamp ASC"
  );
  return rows.map(rowToRecord);
}

// Marks a single record synced. Called only after AWS returns HTTP 200 for
// that specific record. See AGENTS.md → Purge rule.
export async function markRecordSynced(
  id: string,
  syncedAt: string
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE attendance SET synced = 1, syncedAt = ? WHERE id = ?", [
    syncedAt,
    id,
  ]);
}

// Deletes confirmed-synced records. Only ever purges rows already marked synced.
export async function purgeSyncedRecords(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM attendance WHERE synced = 1");
}

export async function countUnsyncedRecords(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM attendance WHERE synced = 0"
  );
  return row?.count ?? 0;
}
