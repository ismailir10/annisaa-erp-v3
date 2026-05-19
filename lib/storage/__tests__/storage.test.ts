import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { saveFile, streamFile, deleteFile, __internal } from "../index";

// Each test gets a fresh tempdir set as UPLOAD_DIR. We DO NOT touch the
// project's `.data/` — that path is real and shared with dev runs.

let tmpRoot: string;
let originalEnv: string | undefined;

async function consumeStream(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

beforeEach(async () => {
  originalEnv = process.env.UPLOAD_DIR;
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "storage-test-"));
  process.env.UPLOAD_DIR = tmpRoot;
});

afterEach(async () => {
  if (originalEnv === undefined) delete process.env.UPLOAD_DIR;
  else process.env.UPLOAD_DIR = originalEnv;
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe("storage adapter — round-trip", () => {
  const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02, 0x03, 0x04]);

  it("saves a file and streams it back with the same bytes + correct mime", async () => {
    const { token } = await saveFile({
      entity: "students",
      entityId: "stu_abc123",
      field: "photo",
      file: { bytes: jpegBytes, mimeType: "image/jpeg", ext: "jpg" },
    });
    expect(token).toMatch(/^local:v1:students\/stu_abc123\/photo-[a-f0-9]{16}\.jpg$/);

    const { stream, mimeType, filename } = await streamFile(token);
    expect(mimeType).toBe("image/jpeg");
    expect(filename).toMatch(/^photo-[a-f0-9]{16}\.jpg$/);
    const back = await consumeStream(stream);
    expect(back.equals(jpegBytes)).toBe(true);
  });

  it("delete removes the file; second delete is a no-op", async () => {
    const { token } = await saveFile({
      entity: "students",
      entityId: "stu_delete",
      field: "photo",
      file: { bytes: jpegBytes, mimeType: "image/jpeg", ext: "jpg" },
    });
    await deleteFile(token);
    await expect(streamFile(token)).rejects.toThrow();
    // ENOENT on a second delete must not throw
    await expect(deleteFile(token)).resolves.toBeUndefined();
  });

  it("same bytes produce the same token (content-addressed)", async () => {
    const a = await saveFile({
      entity: "students",
      entityId: "stu_idemp",
      field: "photo",
      file: { bytes: jpegBytes, mimeType: "image/jpeg", ext: "jpg" },
    });
    const b = await saveFile({
      entity: "students",
      entityId: "stu_idemp",
      field: "photo",
      file: { bytes: jpegBytes, mimeType: "image/jpeg", ext: "jpg" },
    });
    expect(a.token).toBe(b.token);
  });

  it("works for a different entity + field (entity-generic, no hardcoded 'students'/'photo')", async () => {
    const pdfBytes = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    const { token } = await saveFile({
      entity: "parents",
      entityId: "par_xyz",
      field: "ktp",
      file: { bytes: pdfBytes, mimeType: "application/pdf", ext: "pdf" },
    });
    expect(token).toMatch(/^local:v1:parents\/par_xyz\/ktp-[a-f0-9]{16}\.pdf$/);
    const { mimeType } = await streamFile(token);
    expect(mimeType).toBe("application/pdf");
  });
});

describe("storage adapter — path-traversal defense", () => {
  const cases = [
    "local:v1:../etc/passwd",
    "local:v1:students/../../../etc/passwd",
    "local:v1:students/stu/..%2fphoto.jpg",
    "local:v1:students/stu/photo\0.jpg",
    "local:v1:/etc/passwd",
    "local:v1:students\\stu\\photo.jpg",
    "wrong-prefix:students/stu/photo.jpg",
    "local:v1:students/stu/photo.exe", // ext not whitelisted
    "local:v1:students/stu/photo", // no ext
    "local:v1:students/stu/photo/extra/segment.jpg", // too many segments
  ];

  for (const token of cases) {
    it(`rejects malicious token: ${token}`, async () => {
      expect(() => __internal.resolveTokenPath(token)).toThrow();
      await expect(streamFile(token)).rejects.toThrow();
    });
  }
});

describe("storage adapter — input validation", () => {
  const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02, 0x03, 0x04]);

  it("rejects entity with path-traversal chars", async () => {
    await expect(
      saveFile({
        entity: "../etc",
        entityId: "x",
        field: "photo",
        file: { bytes: jpegBytes, mimeType: "image/jpeg", ext: "jpg" },
      }),
    ).rejects.toThrow();
  });

  it("rejects unsupported ext", async () => {
    await expect(
      saveFile({
        entity: "students",
        entityId: "x",
        field: "photo",
        file: { bytes: jpegBytes, mimeType: "application/x-msdownload", ext: "exe" },
      }),
    ).rejects.toThrow();
  });
});

describe("storage adapter — missing file handling", () => {
  it("streamFile throws for a syntactically-valid token whose file is absent", async () => {
    // Hand-craft a token that passes validation but points at no file.
    const token = "local:v1:students/stu_missing/photo-deadbeefdeadbeef.jpg";
    await expect(streamFile(token)).rejects.toThrow();
  });
});
