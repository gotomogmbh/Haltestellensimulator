import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LocalFsStorageAdapter } from "./local-fs";

describe("LocalFsStorageAdapter", () => {
  let root: string;
  let adapter: LocalFsStorageAdapter;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "haltesim-storage-"));
    adapter = new LocalFsStorageAdapter(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("saves under uploads/<kind>/<hash>__<sanitized-name>", async () => {
    const data = new TextEncoder().encode("hello world");
    const result = await adapter.save("excel", "bestand 2026.xlsx", data);

    expect(result.storedPath).toMatch(/^uploads\/excel\/[0-9a-f]{64}__bestand_2026\.xlsx$/);
    expect(result.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(result.sizeBytes).toBe(data.byteLength);

    const onDisk = await readFile(join(root, result.storedPath));
    expect(onDisk.toString()).toBe("hello world");
  });

  it("produces the same contentHash for identical inputs (idempotency check)", async () => {
    const data = new TextEncoder().encode("same payload");
    const a = await adapter.save("poi", "a.csv", data);
    const b = await adapter.save("poi", "b.csv", data);

    expect(a.contentHash).toBe(b.contentHash);
    // Filenames differ → storedPath differs even though hash matches; the
    // ImportFile.contentHash uniqueness in the DB is what prevents the
    // duplicate import, not the path.
    expect(a.storedPath).not.toBe(b.storedPath);
  });

  it("routes each kind to its own subdir", async () => {
    const data = new TextEncoder().encode("x");
    const excel = await adapter.save("excel", "x.xlsx", data);
    const gtfs = await adapter.save("gtfs", "x.zip", data);
    const poi = await adapter.save("poi", "x.csv", data);
    const processed = await adapter.save("processed", "x.json", data);

    expect(excel.storedPath.startsWith("uploads/excel/")).toBe(true);
    expect(gtfs.storedPath.startsWith("uploads/gtfs/")).toBe(true);
    expect(poi.storedPath.startsWith("uploads/poi/")).toBe(true);
    expect(processed.storedPath.startsWith("processed/")).toBe(true);
  });

  it("roundtrips read / exists / delete", async () => {
    const data = new TextEncoder().encode("payload");
    const { storedPath } = await adapter.save("excel", "f.xlsx", data);

    expect(await adapter.exists(storedPath)).toBe(true);

    const readBack = await adapter.read(storedPath);
    expect(readBack.toString()).toBe("payload");

    await adapter.delete(storedPath);
    expect(await adapter.exists(storedPath)).toBe(false);
  });

  it("sanitizes filenames that contain unsafe characters", async () => {
    const data = new TextEncoder().encode("x");
    const { storedPath } = await adapter.save(
      "excel",
      "../naughty path/with spaces & spëcial.xlsx",
      data,
    );

    expect(storedPath).not.toContain("..");
    expect(storedPath).not.toContain(" ");
    expect(storedPath).not.toContain("&");
  });

  it("returns absolute path for tooling", () => {
    const abs = adapter.resolveAbsolutePath("uploads/excel/foo.xlsx");
    expect(abs.startsWith(root)).toBe(true);
    expect(abs.endsWith("/uploads/excel/foo.xlsx")).toBe(true);
  });
});
