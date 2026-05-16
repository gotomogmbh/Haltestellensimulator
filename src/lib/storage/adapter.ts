export type StorageKind = "excel" | "gtfs" | "poi" | "processed";

export interface StoredFile {
  /** Path relative to the storage root (e.g. `uploads/excel/<hash>__<name>.xlsx`). */
  storedPath: string;
  /** Algorithm-prefixed digest, e.g. `sha256:abc123…`. */
  contentHash: string;
  sizeBytes: number;
}

export interface StorageAdapter {
  save(
    kind: StorageKind,
    originalFilename: string,
    data: Uint8Array,
  ): Promise<StoredFile>;
  read(storedPath: string): Promise<Buffer>;
  exists(storedPath: string): Promise<boolean>;
  delete(storedPath: string): Promise<void>;
  /** Absolute filesystem path for tooling that needs it (e.g. unzip a GTFS pkg). */
  resolveAbsolutePath(storedPath: string): string;
}
