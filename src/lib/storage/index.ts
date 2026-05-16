import type { StorageAdapter } from "./adapter";
import { LocalFsStorageAdapter } from "./local-fs";

let cached: StorageAdapter | undefined;

export function getStorage(): StorageAdapter {
  if (cached) return cached;
  const root = process.env.STORAGE_ROOT ?? "./storage";
  cached = new LocalFsStorageAdapter(root);
  return cached;
}

export type { StorageAdapter, StorageKind, StoredFile } from "./adapter";
export { LocalFsStorageAdapter } from "./local-fs";
