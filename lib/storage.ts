// MMKV wrappers for fast key-value reads/writes and Zustand persistence.
// Do not use MMKV directly inside components — always go through this file
// or a Zustand store action. See AGENTS.md → State Rules.
import { createMMKV, type MMKV } from "react-native-mmkv";

// react-native-mmkv v4 exposes MMKV as a type; instances come from createMMKV().
export const storage: MMKV = createMMKV();

// Adapter matching Zustand's StateStorage interface.
export const mmkvStorage = {
  getItem: (key: string) => storage.getString(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.remove(key),
};
