import { test, expect, type Page } from "@playwright/test";

/**
 * T6 — storage-supabase-swap cycle.
 *
 * Round-trip the student photo upload through the new Supabase Storage
 * backend:
 *   1. Seed a student via the admin API.
 *   2. Open /admin/students/[id], upload a minimal valid JPEG.
 *   3. Wait for the POST /api/students/[id]/photo response (token persisted).
 *   4. Page-reload + assert the auth-proxied <img> resolves to 200 with
 *      content-type image/jpeg — i.e. the byte we uploaded was written to
 *      Supabase, the token round-tripped, and the GET handler streamed it
 *      back. The local-disk adapter would 500 with ENOENT here on Vercel.
 *
 * Auth: demo cookie school-erp-session=u_super_admin (admin-only — the
 * POST gate is requireAdmin, GET also accepts a linked guardian).
 * Isolation: each test creates a fresh student. Cleanup marks INACTIVE.
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
 * Minimal valid JPEG: SOI (FF D8 FF) + JFIF APP0 + 1-KB null padding + EOI.
 * Same construction as e2e/admin-guardian-document-upload.spec.ts so the
 * magic-byte gate accepts it (`detectMime` checks the first 3 bytes).
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

// Skip locally + in CI when Supabase env vars are absent. The adapter
// fails fast at `getSupabaseStorageClient` if URL or service-role key is
// missing — there is no local-disk fallback. Preview-verify (which runs
// against feat/* preview deploys carrying staging env vars) is the
// integration coverage; local + CI runs only execute when a developer or
// CI job explicitly provides the env. See cycle Assumption 6 + 8.
const SUPABASE_ENV_READY =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

test.describe("Admin student — photo upload (Supabase Storage backend)", () => {
  test.skip(
    !SUPABASE_ENV_READY,
    "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — preview-verify covers this surface",
  );

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("upload student photo on detail page → token persists → GET streams the bytes", async ({
    page,
  }) => {
    const suffix = Date.now();

    // ---------- Seed student ----------
    const studentRes = await page.request.post("/api/students", {
      data: { name: `E2E PhotoHost ${suffix}` },
    });
    expect(studentRes.status()).toBe(201);
    const student = (await studentRes.json()) as { id: string };

    // ---------- Open /admin/students/[id] ----------
    await page.goto(`/admin/students/${student.id}`);
    await page.waitForLoadState("networkidle");

    // Pre-upload: empty-state initial (the round avatar shows the first letter
    // of the student's name when photoUrl is null).
    await expect(
      page.locator(`img[alt="Foto E2E PhotoHost ${suffix}"]`),
    ).toHaveCount(0);

    // ---------- Upload JPEG ----------
    // The photo input is the only hidden `input[type=file]` on the page in
    // the "Data Anak" card. Trigger via setInputFiles so we don't need to
    // synthesize the click + dialog.
    const jpegBuffer = makeJpegBuffer();
    const fileInput = page.locator('input[type="file"]').first();

    const uploadPromise = page.waitForResponse(
      (res) =>
        res.url().includes(`/api/students/${student.id}/photo`) &&
        res.request().method() === "POST",
    );
    await fileInput.setInputFiles({
      name: "photo.jpg",
      mimeType: "image/jpeg",
      buffer: jpegBuffer,
    });
    const uploadRes = await uploadPromise;
    expect(uploadRes.ok()).toBeTruthy();
    const uploadBody = (await uploadRes.json()) as { photoUrl: string };
    // New backend token prefix — guards against accidental revert to local-disk.
    expect(uploadBody.photoUrl).toMatch(
      /^supabase:v1:students\/[a-zA-Z0-9_-]+\/photo-[a-f0-9]{16}\.jpg$/,
    );

    // ---------- Reload + assert the <img> resolves ----------
    await page.reload();
    await page.waitForLoadState("networkidle");
    const photoImg = page.locator(
      `img[src*="/api/students/${student.id}/photo"]`,
    );
    await expect(photoImg).toHaveCount(1, { timeout: 10_000 });

    // Fetch the photo through the auth-proxy route directly — confirms the
    // Supabase round-trip end-to-end + the security headers are intact.
    const photoStream = await page.request.get(
      `/api/students/${student.id}/photo`,
    );
    expect(photoStream.ok()).toBeTruthy();
    expect(photoStream.headers()["content-type"]).toContain("image/jpeg");
    expect(photoStream.headers()["cache-control"]).toBe("private, no-store");
    const streamedBytes = await photoStream.body();
    expect(streamedBytes.length).toBeGreaterThan(0);
    // Magic-byte prefix preserved byte-for-byte across upload + download.
    expect(streamedBytes.slice(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))).toBe(true);

    // ---------- Cleanup ----------
    await page.request
      .delete(`/api/students/${student.id}/photo`)
      .catch(() => undefined);
    await page.request
      .put(`/api/students/${student.id}`, { data: { status: "INACTIVE" } })
      .catch(() => undefined);
  });
});
