// App-wide constants: timeouts, thresholds, endpoint URLs.
// Secrets (AWS credentials) never live here — see AGENTS.md → Secret Rules.

export const config = {
  // Minimum confidence to accept a face match when writing an attendance record.
  MATCH_CONFIDENCE_THRESHOLD: 0.85,

  // Order in which liveness challenges are presented.
  LIVENESS_STEPS: ["blink", "smile", "turn"] as const,

  // Mock bridge latency (ms) for UI testing before the AI model is ready.
  MOCK_INFERENCE_DELAY_MS: 300,

  // AWS API Gateway endpoint. Real value comes from the environment; empty
  // string is a typing fallback so the app builds without a configured .env.
  SYNC_ENDPOINT: process.env.EXPO_PUBLIC_SYNC_ENDPOINT ?? "",

  // Minimum interval (seconds) between background sync attempts. The OS may
  // extend this; it is never shorter.
  BACKGROUND_SYNC_INTERVAL_SEC: 15 * 60,

  LIVENESS_CHALLENGE_CONFIRM_FRAMES: 2, // minimum frames required for confirm challange

  FRONTAL_YAW_THRESHOLD_DEG: 0, // below this face will be straight

  // Blink challenge: average eye open probability must be below this to pass
  BLINK_THRESHOLD: 0.6,
} as const;
