import { test, expect } from "@playwright/test";

/**
 * Cycle A — enrollment application end-to-end smoke.
 *
 * Walks the full funnel against the deployed build:
 *   admission inquiry → admin "Kirim Formulir" (invite + token) →
 *   tokenized public submit → admin accept → convert → student exists.
 *
 * The parent side is driven through the real public API rather than the
 * 6-step canvas wizard: drawing a signature on a <canvas> in Playwright is
 * fragile, and the wizard's logic is already covered by Vitest unit/route
 * tests. This spec's job is the cross-module contract — proxy public
 * allow-list, token gating, admin auth, the convert transaction, and a real
 * Student surfacing in the admin UI — which unit tests (mocked prisma) cannot
 * exercise.
 *
 * Admin auth: demo cookie school-erp-session=u_super_admin (same as
 * e2e/admin.spec.ts). Public POSTs carry a unique X-Forwarded-For so their
 * per-IP rate-limit buckets don't contend with other suites.
 */

const ADMIN_USER_ID = "u_super_admin";
const STAMP = Date.now();
const CHILD = `E2E Enrol ${STAMP}`;
const PARENT_EMAIL = `e2e-enrol-${STAMP}@example.com`;
const IP = "10.77.0.1";

test.describe.configure({ mode: "serial", timeout: 60_000 });

test.describe("Cycle A — Enrollment application funnel", () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      { name: "school-erp-session", value: ADMIN_USER_ID, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" },
    ]);
  });

  test("invalid token → friendly non-leaking page", async ({ page }) => {
    await page.goto("/pendaftaran/not-a-real-token");
    await expect(page.getByText("Tautan tidak ditemukan")).toBeVisible();
  });

  test("invite → tokenized submit → accept → convert → student exists", async ({ page }) => {
    // 1. Create an admission inquiry (public) with an email so it can be invited.
    const adm = await page.request.post("/api/admission/submit", {
      headers: { "X-Forwarded-For": IP },
      data: {
        childName: CHILD,
        dateOfBirth: "2021-03-15",
        childGender: "P",
        parentName: "E2E Ibu",
        parentPhone: "081200000001",
        parentEmail: PARENT_EMAIL,
      },
    });
    expect(adm.ok()).toBeTruthy();
    const admissionId = (await adm.json()).id as string;

    // 2. Admin invite → returns the tokenized form URL.
    const inv = await page.request.post("/api/enrollments/invite", { data: { admissionId } });
    expect(inv.ok()).toBeTruthy();
    const formUrl = (await inv.json()).formUrl as string;
    expect(formUrl).toContain("/pendaftaran/");
    const token = formUrl.split("/pendaftaran/")[1];
    expect(token.length).toBeGreaterThan(20);

    // 3. The public form page renders for a valid token.
    await page.goto(`/pendaftaran/${token}`);
    await expect(page.getByRole("heading", { name: "Formulir Pendaftaran Murid Baru" })).toBeVisible();

    // 4. Pick a real ACTIVE program for the tenant.
    const progRes = await page.request.get("/api/programs");
    const progJson = await progRes.json();
    const programs = Array.isArray(progJson) ? progJson : (progJson.data ?? []);
    expect(programs.length).toBeGreaterThan(0);
    const programId = programs[0].id as string;

    // 5. Submit the full form via the public token API (signature tokens are
    //    opaque strings here — the canvas upload is unit-tested separately).
    const submit = await page.request.post(`/api/enrollments/token/${token}/submit`, {
      headers: { "X-Forwarded-For": IP },
      data: {
        programId,
        dcareAddon: false,
        studentData: {
          childName: CHILD, childGender: "P", birthPlace: "Bekasi", dateOfBirth: "2021-03-15",
          agama: "ISLAM", kewarganegaraan: "WNI",
        },
        ayahData: { name: "E2E Ayah" },
        ibuData: { name: "E2E Ibu" },
        consentData: {
          agreed: true,
          version: "annisaa-2026-v1",
          ayah: { name: "E2E Ayah", signatureToken: "supabase:v1:enrollment/x/ayah-signature-deadbeef.png" },
          ibu: { name: "E2E Ibu", signatureToken: "supabase:v1:enrollment/x/ibu-signature-deadbeef.png" },
        },
      },
    });
    expect(submit.status()).toBe(201);

    // 6. Admin finds the SUBMITTED application.
    const list = await page.request.get(`/api/enrollments?status=SUBMITTED&search=${encodeURIComponent(CHILD)}&pageSize=20`);
    const row = (await list.json()).data.find((r: { childName: string }) => r.childName === CHILD);
    expect(row).toBeTruthy();
    const appId = row.id as string;

    // 7. Accept, then convert.
    const accept = await page.request.patch(`/api/enrollments/${appId}`, { data: { status: "ACCEPTED" } });
    expect(accept.ok()).toBeTruthy();
    const convert = await page.request.post(`/api/enrollments/${appId}/convert`);
    expect(convert.ok()).toBeTruthy();

    // 8. The detail page now shows the converted state in the real UI.
    await page.goto(`/admin/enrollments/${appId}`);
    await expect(page.getByText("sudah dikonversi menjadi data siswa")).toBeVisible();

    // 9. A real Student exists for this child in the admin students list.
    const stu = await page.request.get(`/api/students?search=${encodeURIComponent(CHILD)}&pageSize=20`);
    const students = (await stu.json()).data ?? [];
    expect(students.some((s: { name: string }) => s.name === CHILD)).toBeTruthy();
  });
});
