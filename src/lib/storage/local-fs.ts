import { createHash } from "node:crypto";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

import type { StorageAdapter, StorageKind, StoredFile } from "./adapter";

const KIND_TO_SUBDIR: Record<StorageKind, string> = {
  excel: "uploads/excel",
  gtfs: "uploads/gtfs",
  poi: "uploads/poi",
  processed: "processed",
};

function sanitize(filename: string): string {
  return filename.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "file";
}

export class LocalFsStorageAdapter implements StorageAdapter {
  private readonly root: string;

  constructor(root: string) {
    this.root = isAbsolute(root) ? root : resolve(process.cwd(), root);
  }

  resolveAbsolutePath(storedPath: string): string {
    return join(this.root, storedPath);
  }

  async save(
    kind: StorageKind,
    originalFilename: string,
    data: Uint8Array,
  ): Promise<StoredFile> {
    const hash = createHash("sha256").update(data).digest("hex");
    const storedPath = `${KIND_TO_SUBDIR[kind]}/${hash}__${sanitize(originalFilename)}`;
    const absolute = this.resolveAbsolutePath(storedPath);

    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, data);

    return {
      storedPath,
      contentHash: `sha256:${hash}`,
      sizeBytes: data.byteLength,
    };
  }

  async read(storedPath: string): Promise<Buffer> {
    return readFile(this.resolveAbsolutePath(storedPath));
  }

  async exists(storedPath: string): Promise<boolean> {
    try {
      await stat(this.resolveAbsolutePath(storedPath));
      return true;
    } catch {
      return false;
    }
  }

  async delete(storedPath: string): Promise<void> {
    await unlink(this.resolveAbsolutePath(storedPath));
  }
}
