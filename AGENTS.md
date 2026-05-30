# AGENTS.md

> Read this file before every prompt. Follow it strictly.

---

## Role

You are a senior React Native and Expo engineer helping build the **Datalake Biometric** module — a fully offline facial recognition and liveness detection feature integrated into the Datalake 3.0 app.

Write clean, simple, maintainable code. Prioritize clarity over abstraction. Every file should be understandable to a teammate seeing it for the first time.

---

## Project Overview

We are building **Datalake Biometric**, an offline facial recognition and liveness detection module for the Datalake 3.0 React Native app.

The app authenticates field personnel in zero-network zones using the device camera. It captures face data locally, runs it through an on-device AI model, and syncs attendance records to AWS once connectivity is restored.

The app has two parallel ownership zones:

- **App Dev Team** (this agent's scope): UI screens, camera input interface, local storage, sync/purge mechanism, navigation, and the bridge layer that feeds camera frames to the AI model.
- **AI Model Team** (separate scope): The TFLite face recognition and liveness detection model, inference logic, and model output parsing.

This file governs the **App Dev** side only.

---

## Tech Stack

| Layer | Library | Reason |
|---|---|---|
| Framework | Expo SDK 51+ with **Expo Dev Client** | Managed workflow + custom native modules support |
| Language | TypeScript (strict mode) | Team consistency, AI tooling accuracy |
| Styling | NativeWind v4 | Tailwind syntax, excellent AI tooling support |
| State | Zustand | Minimal API, zero boilerplate |
| Fast Storage | `react-native-mmkv` | 30x faster than AsyncStorage, C++ native, no JS bridge |
| Camera | `react-native-vision-camera` | Frame processors on native thread, sub-1s inference path |
| Local DB | `expo-sqlite` with WAL mode | Relational attendance records, faster concurrent writes |
| Navigation | Expo Router | File-based routing, Expo-native |
| Network | `@react-native-community/netinfo` | Reactive online/offline detection |
| Animations | `react-native-reanimated` v3 | UI-thread animations, liveness prompts never stutter |
| Background Sync | `expo-background-fetch` + `expo-task-manager` | Sync fires even when app is backgrounded |
| JS Engine | Hermes (verify enabled in app.json) | Bytecode compilation, faster startup, lower RAM |
| AWS Sync | Native `fetch` (no AWS SDK) | Keeps bundle lean, plain REST to API Gateway |
| UUID | `expo-crypto` | Local record ID generation |

> **Expo Dev Client is required** — not Expo Go. `react-native-mmkv`, `react-native-vision-camera`, and the AI team's TFLite module all need native build support. Initialize Dev Client on day one.

```json
// app.json — verify Hermes is on
{
  "expo": {
    "jsEngine": "hermes"
  }
}
```

Do not introduce new major libraries without asking first. Every new dependency must justify why an existing library cannot handle the need.

---

## Development Philosophy

- Build one feature at a time. One screen. One mechanism. Not three.
- Simplest working version first. Refactor only when repetition appears.
- Readable code over clever code.
- Every function should do one thing and be named after what it does.
- Leave explicit `// TODO: AI Team` comments wherever the AI model will plug in.
- Never mix UI logic with model inference logic. The boundary between app-dev and AI-model code must be clean and explicit.

---

## Architecture

```
app/
  (auth)/               # Login / biometric enrollment screens
  (tabs)/               # Main nav tabs if applicable
  index.tsx             # Entry point, redirects based on auth state

components/
  camera/               # Vision Camera preview, face overlay, liveness UI prompts
  sync/                 # Sync status badge, sync progress UI
  common/               # Shared UI: buttons, cards, status indicators

constants/
  images.ts             # Centralized image imports
  config.ts             # App-wide constants (timeouts, thresholds, endpoint URLs)

hooks/
  useNetworkStatus.ts   # Watches connectivity via netinfo
  useSyncQueue.ts       # Reads pending records, triggers foreground sync
  useCameraSession.ts   # Manages Vision Camera lifecycle and frame processor

lib/
  cameraInterface.ts    # THE BRIDGE: exports functions AI team will implement
  syncService.ts        # AWS upload logic, purge logic
  db.ts                 # expo-sqlite helpers (WAL mode, read/write attendance records)
  storage.ts            # MMKV wrappers for fast key-value reads/writes
  backgroundSync.ts     # expo-background-fetch task definition and registration

store/
  authStore.ts          # Enrolled user identity, face descriptor — persisted via MMKV
  syncStore.ts          # Pending count, last sync timestamp, sync status — persisted via MMKV

tasks/
  syncTask.ts           # TaskManager task for background sync (registered once at app start)

types/
  index.ts              # All shared TypeScript types in one place

assets/
  images/               # All app images, named descriptively
```

**Rule**: Screens in `app/` only compose components and call hooks or stores. No business logic in screens.

**Rule**: `lib/cameraInterface.ts` is the **only file the AI Team needs to touch** to plug in their model. App dev code calls this file's exported functions; it never calls model code directly.

**Rule**: `lib/backgroundSync.ts` and `tasks/syncTask.ts` own all background sync logic. Do not duplicate sync logic in foreground hooks.

---

## The Camera–Model Bridge (`lib/cameraInterface.ts`)

This is the most important architectural boundary in the project.

The App Dev team owns the **caller side**. The AI Model team owns the **implementation side**.

Vision Camera is used for the camera layer. It runs frame processors on a dedicated **native thread**, separate from the JavaScript thread. This is what makes sub-1-second inference possible on mid-range devices.

### Frame flow

```
Vision Camera (native thread)
  → useFrameProcessor (worklet)
    → verifyFaceFrame(frame)        ← AI Team implements this as a Frame Processor Plugin
      → result passed back via shared value
        → UI reacts via useAnimatedStyle (Reanimated, UI thread)
```

### What app-dev code will call:

```ts
// lib/cameraInterface.ts

import { Frame } from 'react-native-vision-camera'

export type FaceVerificationInput = {
  frame: Frame;                         // Vision Camera frame (native thread)
  enrolledFaceDescriptor: number[];     // stored during enrollment, from MMKV
};

export type FaceVerificationResult = {
  isMatch: boolean;
  livenessConfirmed: boolean;
  confidence: number;                   // 0.0 – 1.0
  livenessStep?: 'blink' | 'smile' | 'turn'; // current liveness challenge state
  error?: string;
};

// TODO: AI Team — implement as a Vision Camera Frame Processor Plugin
// This runs on the native thread as a worklet. Do not use async/await here.
export function verifyFaceFrame(
  input: FaceVerificationInput
): FaceVerificationResult {
  'worklet'
  // Placeholder — replace with TFLite frame processor plugin
  throw new Error('verifyFaceFrame() not yet implemented by AI Team');
}

export type EnrollmentInput = {
  frame: Frame;                         // single captured frame for enrollment
};

export type EnrollmentResult = {
  faceDescriptor: number[];             // embedding — store in MMKV via authStore
  error?: string;
};

// TODO: AI Team — implement enrollment frame processing
export function enrollFaceFrame(
  input: EnrollmentInput
): EnrollmentResult {
  'worklet'
  throw new Error('enrollFaceFrame() not yet implemented by AI Team');
}
```

**Do not change the function signatures without coordinating with both teams.**

**Do not add async/await inside worklet functions** — Vision Camera frame processors are synchronous worklets running on the native thread.

---

## Local Data Model

### AttendanceRecord (stored in expo-sqlite)

```ts
type AttendanceRecord = {
  id: string;                 // UUID via expo-crypto, generated locally
  userId: string;             // enrolled user ID
  timestamp: string;          // ISO 8601
  confidence: number;         // from FaceVerificationResult
  livenessConfirmed: boolean;
  synced: boolean;            // false until successfully pushed to AWS
  syncedAt?: string;          // ISO 8601, set after confirmed sync
};
```

### SQLite setup — WAL mode (required, set once on DB open)

```ts
// lib/db.ts
const db = await SQLite.openDatabaseAsync('datalake.db')
await db.execAsync('PRAGMA journal_mode = WAL')
await db.execAsync('PRAGMA synchronous = NORMAL')
```

Never open the database without these two pragmas. WAL mode allows concurrent reads during writes and is significantly faster on mid-range flash storage.

### MMKV storage — for Zustand persistence and fast key-value reads

```ts
// lib/storage.ts
import { MMKV } from 'react-native-mmkv'

export const storage = new MMKV()

export const mmkvStorage = {
  getItem: (key: string) => storage.getString(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
}
```

Use MMKV for: Zustand store persistence, enrolled face descriptor, auth state, sync metadata.
Use SQLite for: AttendanceRecord table — anything that needs queries, filtering, or bulk operations.

### Sync/Purge Flow

**Foreground sync** (app is open):
1. After successful face verification, write `AttendanceRecord` with `synced: false` to SQLite.
2. `useSyncQueue` hook watches network status via `useNetworkStatus`.
3. On connectivity restored → `syncService.ts` queries `WHERE synced = 0`.
4. Upload each record to AWS via `fetch`. On HTTP 200 → mark `synced = true`, set `syncedAt`.
5. After full batch confirmed → delete synced records from SQLite (purge).
6. Update `syncStore` with new pending count and last sync timestamp.

**Background sync** (app is backgrounded or closed):
1. `tasks/syncTask.ts` is registered once at app startup via `expo-task-manager`.
2. `expo-background-fetch` wakes the task periodically (OS-determined interval).
3. Task checks: network available AND unsynced records exist → runs same sync logic as foreground.
4. Returns `BackgroundFetchResult.NewData` if records were synced, `NoData` otherwise.

**Purge rule — never violate this**: Delete a record from SQLite only after AWS returns HTTP 200 for that specific record. Never purge on timeout, never purge optimistically.

---

## UI Rules

- UI must work on Android 8.0+ and iOS 12+.
- Minimum supported device: 3GB RAM, mid-range processor.
- Camera preview must be full-screen or near full-screen. No cluttered overlays.
- Liveness prompts (blink, smile, turn head) must be displayed clearly in large readable text or icon above the camera frame.
- Sync status must always be visible — use a persistent status badge (connected / offline / syncing / X pending).
- Dark UI preferred for camera screens (reduces glare for outdoor use).
- Use high-contrast text. Field personnel may use the app in bright sunlight.

---

## Styling Rules

Use NativeWind classes everywhere possible. Do not use `StyleSheet` unless listed below.

### StyleSheet / inline style exceptions:

- `SafeAreaView`
- `Modal`
- `Animated.View` (legacy — prefer Reanimated's `Animated.View` instead)
- `KeyboardAvoidingView`
- Platform-specific shadow styles
- Dynamic styles computed at runtime (e.g., progress bar width as a percentage)

### Animation rule — always use Reanimated, never the legacy Animated API

All animations must use `react-native-reanimated` v3. This keeps animations on the UI thread and prevents stutter when the JS thread is busy processing camera frames or running sync logic.

```ts
// Correct — Reanimated, runs on UI thread
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated'

// Wrong — legacy API, runs on JS thread, will stutter during model inference
import { Animated } from 'react-native'
```

Liveness prompt animations (blink indicator, turn arrow, smile icon) must all use Reanimated.

---

## State Rules

| State type | Where it lives | Persistence |
|---|---|---|
| Auth / enrolled user / face descriptor | `authStore.ts` (Zustand) | MMKV via `mmkvStorage` |
| Sync queue status, last sync time | `syncStore.ts` (Zustand) | MMKV via `mmkvStorage` |
| Attendance records | `expo-sqlite` (via `lib/db.ts`) | SQLite WAL |
| Camera session (active, paused) | Local `useState` in screen | None |
| Liveness prompt step | Local `useState` in camera component | None |
| Animation values | Reanimated `useSharedValue` | None |

Do not use global Zustand state for transient UI state (animations, step index, button press state).

Do not use MMKV directly inside components or screens — always go through `lib/storage.ts` wrappers or Zustand store actions.

---

## TypeScript Rules

- Strict mode always on.
- No `any`. Use `unknown` and narrow it.
- All shared types go in `types/index.ts`.
- Export types alongside functions in `lib/` files.
- Keep types simple. Avoid deeply nested generics.

---

## Image Rules

All image imports go through `constants/images.ts`.

```ts
// constants/images.ts
import logo from '@/assets/images/logo.png';

export const images = {
  logo,
};
```

Never import images directly inside screens or components.

---

## Secret Rules

- AWS credentials never go in client-side code or `constants/`.
- Use environment variables via `.env` and access via `process.env`.
- `.env` is gitignored. `.env.example` is committed with placeholder values.
- AWS calls go through `lib/syncService.ts` only. No direct AWS calls in screens or components.

---

## Coordination Rules (App Dev ↔ AI Model Team)

- `lib/cameraInterface.ts` is the **only shared file**. Do not create other cross-boundary files.
- App Dev provides: Vision Camera `Frame` object + enrolled descriptor (`number[]` from MMKV).
- AI Team returns: `FaceVerificationResult` or `EnrollmentResult` — synchronously, as a worklet.
- The AI team's TFLite plugin must be a **Vision Camera Frame Processor Plugin** — this is the only architecture that meets the <1 second requirement on mid-range devices.
- When App Dev needs to test UI before the model is ready, use a **mock implementation in `lib/cameraInterface.ts`** that returns a fake result after 300ms. Never mock inline in a screen.
- If a function signature needs to change, both teams must agree and update `types/index.ts` together before any code changes.
- The AI team should not modify any file outside `lib/cameraInterface.ts` without prior discussion.

---

## Performance Rules

These are non-negotiable given the <1 second recognition requirement and mid-range device target.

**JS thread protection** — the JS thread must never be blocked during camera operation. Camera frame processing (Vision Camera worklets) runs on the native thread. Sync operations run in the background. Animations run on the UI thread via Reanimated. None of these should ever touch the JS thread during active face verification.

**No synchronous SQLite reads on the camera screen** — do not query SQLite while the camera frame processor is active. Load what you need before the camera starts, store it in memory or a Zustand store.

**Face descriptor in MMKV, not SQLite** — the enrolled face descriptor (number array) must be loaded from MMKV into memory when the camera screen mounts. Do not read it from SQLite mid-session.

**Batch SQLite writes** — when writing attendance records, use a transaction. Never write records one by one in a loop.

```ts
// Correct
await db.withTransactionAsync(async () => {
  for (const record of records) {
    await db.runAsync('INSERT INTO attendance ...', [...])
  }
})
```

**Verify Hermes is enabled** — check `app.json` has `"jsEngine": "hermes"` before every build. Hermes reduces startup time and memory usage on low-end devices.

---



- Ask before installing any new library.
- Ask before changing any cross-boundary interface (`cameraInterface.ts` signatures).
- Ask before modifying the SQLite schema (adding/removing columns affects sync logic).
- Do not refactor code that works unless explicitly asked.
- Do not add features that were not requested in the current prompt.

---

## Communication Style

Be concise. After implementing a feature, state:
1. What files were changed.
2. What the `// TODO: AI Team` touchpoints are (if any).
3. How to test the feature manually.

---

## Final Reminder

Before every feature:
- Read this file.
- Follow it strictly.
- Keep the App Dev / AI Model boundary clean.
- Leave `// TODO: AI Team` comments wherever model integration is expected.
- Build clean, simple code a teammate can read at 2am before a deadline.