// Admin Students canary — first Playwright spec on the v2 scaffold engine
// (p2-scaffold-canary T6). Re-enables the rebuild-window-guarded CI
// Playwright job globally per `.github/workflows/ci.yml:115-127` (the
// guard auto-skips the suite until a single `e2e/**/*.spec.ts` lands).
//
// Scope (read-only navigation smoke):
//   - Demo-mode login → cookie present.
//   - List page renders with empty-state copy.
//   - New-form page renders with required-field labels + Simpan / Batal.
//   - Cancel link returns to list.
//   - Search-filter empty state distinguishes from cold-empty state.
//
// Form-submit + detail + edit + soft-delete + restore explicitly DROPPED:
//   - `/api/Program` + `/api/Household` GET endpoints don't exist yet
//     (RelationRenderer would render "Gagal memuat" for both fields).
//   - No Household seed exists; FK targets unavailable.
//   - Student `entity.detailActions = []` — no soft-delete UI affordance.
// Wiring those is a separate entity-actions cycle.
//
// Auth: POST /api/demo/login?role=admin writes a 24h HMAC-signed cookie
// per `lib/auth/demo-cookie.ts:36-46` (DemoSessionPayload carries
// tenantId/userId/supabaseUserId/role/currentTermId). The Playwright
// browser context picks up the cookie automatically because the login
// endpoint sets it via Set-Cookie on the same origin.
//
// Cycle: docs/cycles/2026-05-07-p2-scaffold-canary.md (T6)

import { test, expect } from "@playwright/test";

test.describe("admin students canary", () => {
  test("read-only navigation smoke", async ({ page }) => {
    // 1. Demo-mode login — POST /api/demo/login?role=admin returns 200 +
    //    Set-Cookie. Use `page.request` so the cookie lands on the page's
    //    BrowserContext (not the test-level `request` fixture, which has
    //    its own isolated cookie jar).
    const loginRes = await page.request.post(
      "/api/demo/login?role=admin",
      { failOnStatusCode: false },
    );
    expect(loginRes.status(), "login responds 200").toBe(200);
    const loginBody = await loginRes.json();
    expect(loginBody.role, "login response carries role").toBe("admin");

    // 2. Navigate to admin Students list.
    await page.goto("/admin/akademik/siswa");

    // 3. List page renders the entity heading.
    await expect(
      page.locator('h1:has-text("Siswa")'),
      "h1 heading 'Siswa' visible",
    ).toBeVisible();

    // 4. Breadcrumb trail includes the parent group.
    await expect(
      page.getByRole("link", { name: "Akademik" }),
      "breadcrumb 'Akademik' link visible",
    ).toBeVisible();

    // 5. Empty-state copy when no rows seeded (CI runs `db push --force-reset`
    //    + seed; seeded set has no students). Both strings come from
    //    lib/scaffold/list-page.tsx empty branch.
    await expect(
      page.locator("text=Belum ada siswa"),
      "cold empty-state title visible",
    ).toBeVisible();
    await expect(
      page.locator("text=Tambahkan siswa pertama untuk mulai."),
      "cold empty-state description visible",
    ).toBeVisible();

    // 6. Navigate to new-student form by URL (no list-page CTA exists for
    //    cold-empty state per current scaffold).
    await page.goto("/admin/akademik/siswa/new");

    // 7. Form heading "Tambah Siswa".
    await expect(
      page.locator('h1:has-text("Tambah Siswa")'),
      "form heading 'Tambah Siswa' visible",
    ).toBeVisible();

    // 8. Required identity field label visible.
    await expect(
      page.locator('text=/^Nama Lengkap/'),
      "required field 'Nama Lengkap' label visible",
    ).toBeVisible();

    // 9. Required gender field label visible.
    await expect(
      page.locator('text=/^Jenis Kelamin/'),
      "required field 'Jenis Kelamin' label visible",
    ).toBeVisible();

    // 10. Required program FK field label visible.
    await expect(
      page.locator('text=/^Program/').first(),
      "required field 'Program' label visible",
    ).toBeVisible();

    // 11. Required household FK field label visible.
    await expect(
      page.locator('text=/^Keluarga/').first(),
      "required field 'Keluarga' label visible",
    ).toBeVisible();

    // 12. Submit button.
    await expect(
      page.getByRole("button", { name: "Simpan" }),
      "submit button 'Simpan' visible",
    ).toBeVisible();

    // 13. Cancel link returns to list.
    const cancelLink = page.getByRole("link", { name: "Batal" });
    await expect(cancelLink, "cancel link 'Batal' visible").toBeVisible();
    await cancelLink.click();
    await expect(
      page,
      "cancel returns to list URL",
    ).toHaveURL(/\/admin\/akademik\/siswa$/);

    // 14. Filter-empty state — searching with a non-matching term shows the
    //     "Tidak ada hasil" string instead of the cold "Belum ada" copy.
    //     Verifies the dataFetcher search predicate runs.
    await page.goto("/admin/akademik/siswa?q=zzz-no-match-zzz");
    await expect(
      page.locator("text=Tidak ada hasil"),
      "filter-empty state distinguishes from cold-empty",
    ).toBeVisible();
  });
});
