import { test, expect, type Page } from "@playwright/test";

/**
 * T12 — kesiswaan CRUD parity.
 *
 * Covers T14 + T15 end-to-end via the admin UI:
 *   1. Upload KTP (JPG) to a parent on /admin/guardians/[id]
 *   2. Upload KK (JPG) to the same parent
 *   3. Verify both round-trip — Parent row has ktpUrl + kkUrl, the embed
 *      preview points at the auth-proxied /api/parents/[id]/{ktp,kk} routes
 *   4. Open the linked Student detail page → "Dokumen Keluarga" section
 *      renders KK preview resolved via the primary guardian (T15)
 *
 * Upload buffer: minimal valid JPEG (SOI + APP0 + EOI). The server runs
 * `detectMime` against the first 3 bytes (FF D8 FF), so a 1KB synthetic
 * buffer with the correct prefix passes the magic-byte gate. See
 * lib/storage/mime.ts:27 — JPEG_SIGNATURE = [0xff, 0xd8, 0xff].
 *
 * Auth: demo cookie school-erp-session=u_super_admin (admin-only — the
 * GET routes 403 portal users per UU PDP 27/2022).
 * Isolation: every test creates a fresh student + parent. Cleanup leaves the
 * student INACTIVE; the upload files written under .data/uploads survive but
 * are content-addressed (sha256-hash) so re-runs don't accumulate noise.
 */

const ADMIN_USER_ID = "u_super_admin";

async function loginAsAdmin(page: Page) {
  await page.context().addCookies([
    {
      name: "school-erp-session",
      value: ADMIN_USER_ID,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

/**
 * Minimal valid JPEG: SOI marker (FF D8 FF) + JFIF APP0 header + EOI (FF D9).
 * Hand-rolled so we don't pull in @ffmpeg/util or sharp for a 100-byte buffer.
 * The server's magic-byte check only inspects the first 3 bytes; we include
 * the APP0 + EOI so the file is structurally a JPEG too (defends against
 * a future tightening of the validator).
 */
function makeJpegBuffer(): Buffer {
  const header = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  ]);
  const padding = Buffer.alloc(1024 - header.length - 2, 0x00);
  const eoi = Buffer.from([0xff, 0xd9]);
  return Buffer.concat([header, padding, eoi]);
}

test.describe("Admin guardian — KTP + KK upload + Student KK preview", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("upload KTP + KK on guardian detail; Student detail KK preview resolves via primary guardian", async ({
    page,
  }) => {
    const suffix = Date.now();

    // ---------- Seed student + primary guardian ----------
    const studentRes = await page.request.post("/api/students", {
      data: { name: `E2E DocHost ${suffix}` },
    });
    expect(studentRes.status()).toBe(201);
    const student = (await studentRes.json()) as { id: string };

    const guardianRes = await page.request.post(
      `/api/students/${student.id}/guardians`,
      {
        data: {
          name: `E2E ParentDocs ${suffix}`,
          relationship: "IBU",
          phone: `0818111${String(suffix).slice(-4)}`,
          email: `e2e-docs-${suffix}@example.test`,
          isPrimary: true,
        },
      },
    );
    expect(guardianRes.status()).toBe(201);
    const guardian = (await guardianRes.json()) as {
      id: string;
      parent: { id: string };
    };
    const parentId = guardian.parent.id;

    // ---------- Open /admin/guardians/[id] ----------
    await page.goto(`/admin/guardians/${parentId}`);
    await expect(
      page.getByRole("heading", { name: /Dokumen/i }).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Empty-state nudges visible before upload.
    await expect(page.getByText("KTP belum diunggah")).toBeVisible();
    await expect(page.getByText("KK belum diunggah")).toBeVisible();

    // ---------- Upload KTP ----------
    // DocumentUploadCell ships one hidden <input type="file"> per cell.
    // The KTP cell is the first; the KK cell is the second (md:grid-cols-2).
    const jpegBuffer = makeJpegBuffer();
    const fileInputs = page.locator('input[type="file"]');
    await expect(fileInputs).toHaveCount(2);

    const ktpUploadPromise = page.waitForResponse(
      (res) =>
        res.url().includes(`/api/parents/${parentId}/ktp`) &&
        res.request().method() === "POST",
    );
    await fileInputs.nth(0).setInputFiles({
      name: "ktp.jpg",
      mimeType: "image/jpeg",
      buffer: jpegBuffer,
    });
    const ktpRes = await ktpUploadPromise;
    expect(ktpRes.ok()).toBeTruthy();

    // ---------- Upload KK ----------
    const kkUploadPromise = page.waitForResponse(
      (res) =>
        res.url().includes(`/api/parents/${parentId}/kk`) &&
        res.request().method() === "POST",
    );
    await fileInputs.nth(1).setInputFiles({
      name: "kk.jpg",
      mimeType: "image/jpeg",
      buffer: jpegBuffer,
    });
    const kkRes = await kkUploadPromise;
    expect(kkRes.ok()).toBeTruthy();

    // ---------- Assert Parent row carries both tokens ----------
    const parentResAfter = await page.request.get(`/api/parents/${parentId}`);
    expect(parentResAfter.ok()).toBeTruthy();
    const parentAfter = (await parentResAfter.json()) as {
      ktpUrl: string | null;
      kkUrl: string | null;
    };
    expect(parentAfter.ktpUrl).toBeTruthy();
    expect(parentAfter.kkUrl).toBeTruthy();

    // ---------- Assert authenticated GET streams the file ----------
    const ktpStream = await page.request.get(`/api/parents/${parentId}/ktp`);
    expect(ktpStream.ok()).toBeTruthy();
    expect(ktpStream.headers()["content-type"]).toContain("image/jpeg");
    const kkStream = await page.request.get(`/api/parents/${parentId}/kk`);
    expect(kkStream.ok()).toBeTruthy();
    expect(kkStream.headers()["content-type"]).toContain("image/jpeg");

    // ---------- Assert embed previews render with auth-proxied src ----------
    // After upload the cell re-renders (onMutated → fetchParent). Embeds are
    // not a focusable element; assert presence + src shape, not toBeVisible.
    const ktpEmbed = page.locator(
      `embed[src*="/api/parents/${parentId}/ktp"]`,
    );
    await expect(ktpEmbed).toHaveCount(1, { timeout: 10_000 });
    const kkEmbed = page.locator(
      `embed[src*="/api/parents/${parentId}/kk"]`,
    );
    await expect(kkEmbed).toHaveCount(1);

    // ---------- T15: Student detail KK preview via primary guardian ----------
    await page.goto(`/admin/students/${student.id}`);
    await expect(
      page.getByRole("heading", { name: /Dokumen Keluarga/i }).first(),
    ).toBeVisible({ timeout: 15_000 });

    // The student's primary guardian is the parent we just uploaded KK on,
    // so the resolved embed src must point at THIS parent's /kk endpoint.
    const studentKkEmbed = page.locator(
      `embed[src^="/api/parents/${parentId}/kk"]`,
    );
    await expect(studentKkEmbed).toHaveCount(1);

    // ---------- Cleanup ----------
    await page.request
      .put(`/api/students/${student.id}`, { data: { status: "INACTIVE" } })
      .catch(() => undefined);
  });
});
