import { test, expect, type Page } from "@playwright/test";

/**
 * T12 — kesiswaan CRUD parity.
 *
 * Verifies the `/admin/guardians/[id]` detail route renders (no 404, the
 * pre-cycle regression the audit caught) AND that editing a field from the
 * detail-page Edit dialog round-trips through `PUT /api/guardians/[id]`
 * (which proxies the unified GuardianForm payload into /api/parents/[id]
 * via the StudentGuardian junction first-row lookup — see saveParent in
 * app/admin/guardians/[id]/page.tsx:229).
 *
 * Auth: demo cookie school-erp-session=u_super_admin.
 * Isolation: creates a fresh student + parent + StudentGuardian link via
 * API so the spec doesn't depend on seed ordering.
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

test.describe("Admin guardian detail — navigate + edit round-trip", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("navigate from /admin/guardians to /admin/guardians/[id], edit phone, assert persistence via API + DOM", async ({
    page,
  }) => {
    const suffix = Date.now();

    // ---------- Build a fresh student + linked parent via API ----------
    // POST /api/students returns 201 with the new student; we then add a
    // guardian via POST /api/students/[id]/guardians which upserts the
    // Parent row and creates the StudentGuardian junction.
    const studentRes = await page.request.post("/api/students", {
      data: { name: `E2E GuardianHost ${suffix}` },
    });
    expect(studentRes.status()).toBe(201);
    const student = (await studentRes.json()) as { id: string };

    const initialPhone = "0811000" + String(suffix).slice(-4);
    const guardianRes = await page.request.post(
      `/api/students/${student.id}/guardians`,
      {
        data: {
          name: `E2E ParentDetail ${suffix}`,
          relationship: "IBU",
          phone: initialPhone,
          email: `e2e-guardian-detail-${suffix}@example.test`,
          isPrimary: true,
        },
      },
    );
    expect(guardianRes.status()).toBe(201);
    const guardian = (await guardianRes.json()) as {
      id: string;
      parent: { id: string; name: string };
    };
    const parentId = guardian.parent.id;
    const parentName = guardian.parent.name;

    // ---------- Land on /admin/guardians ----------
    await page.goto("/admin/guardians");
    await page.waitForLoadState("networkidle");

    // The list paginates 20-at-a-time; search by name to surface the row.
    await page
      .getByPlaceholder("Cari nama, email, atau telepon...")
      .fill(parentName);
    // Wait for the filtered fetch to land. URLSearchParams encodes spaces as
    // `+`, not %20, so substring-matching encodeURIComponent() output races
    // against the actual request URL. Just look for `search=` on /api/guardians.
    await page.waitForResponse(
      (res) =>
        res.url().includes("/api/guardians") &&
        res.url().includes("search=") &&
        res.ok(),
      { timeout: 15_000 },
    );

    // Click the name button → routes to /admin/guardians/[parentId].
    await page.getByRole("button", { name: parentName }).first().click();
    await page.waitForURL(`**/admin/guardians/${parentId}`, { timeout: 15_000 });

    // Detail page renders (not 404 — the pre-cycle regression).
    await expect(
      page.getByRole("heading", { name: parentName }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(initialPhone).first()).toBeVisible();

    // ---------- Edit via the detail page Edit dialog ----------
    // The detail page exposes an "Edit" button in the DetailPageHeader actions
    // slot. Click → renders the inline GuardianFormBody with editForm hydrated
    // from the GET /api/parents/[id] payload.
    await page.getByRole("button", { name: /^Edit$/ }).click();

    // Wait for the form fields to mount — the address Input has a stable
    // placeholder via GuardianFormBody.
    const newPhone = `0822999${String(suffix).slice(-4)}`;

    // The Phone field uses placeholder "081234567890" inside the GuardianFormBody.
    // Locate via placeholder (label associations aren't htmlFor-bound here).
    const phoneInput = page.getByPlaceholder("081234567890").first();
    await expect(phoneInput).toBeVisible({ timeout: 10_000 });
    await phoneInput.fill(newPhone);

    // Save — header surfaces "Simpan Perubahan" while editing.
    const savePromise = page.waitForResponse(
      (res) =>
        res.url().includes(`/api/guardians/${guardian.id}`) &&
        res.request().method() === "PUT",
    );
    await page.getByRole("button", { name: /Simpan Perubahan/ }).click();
    const saveRes = await savePromise;
    if (!saveRes.ok()) {
      const errBody = await saveRes.text();
      throw new Error(`PUT ${saveRes.url()} returned ${saveRes.status()}: ${errBody}`);
    }

    // ---------- Assert persistence — API readback + DOM render ----------
    const apiRes = await page.request.get(`/api/parents/${parentId}`);
    expect(apiRes.ok()).toBeTruthy();
    const stored = (await apiRes.json()) as { phone: string };
    expect(stored.phone).toBe(newPhone);

    // DOM render — the detail page re-fetches after save, so the new phone
    // surfaces in the read-only display block.
    await expect(page.getByText(newPhone).first()).toBeVisible({
      timeout: 15_000,
    });

    // ---------- Cleanup ----------
    // Deactivate the host student so the marathon run does not accumulate.
    await page.request
      .put(`/api/students/${student.id}`, { data: { status: "INACTIVE" } })
      .catch(() => undefined);
  });
});
