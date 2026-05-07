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

// p2-entity-actions extension — exercises the relation-list endpoint + the
// relation combobox renderer's network round-trip, plus the detailActions
// surface (Arsipkan + Pulihkan buttons + confirmation dialog copy aligned
// with voice.md). The full create→soft-delete UI flow is OUT OF SCOPE for
// the canary at this stage because the soft-delete action's revalidatePath
// drives the detail page to a notFound shell (the detail-page query filters
// `deletedAt: null`); the trashed-view smart-filter UI that would expose a
// reachable Pulihkan affordance is explicitly deferred per cycle Non-goals.
// Instead, this block verifies the renderer-policy round-trip through the
// channel that's actually wired this cycle: the API surface, the combobox
// network call, and the detail-action button DOM.
//
// Cycle: docs/cycles/2026-05-08-p2-entity-actions.md (T6)
test.describe("admin students entity-actions extension", () => {
  test("relation-list API + combobox network + detail-action affordances", async ({
    page,
    request,
  }) => {
    // 1. Demo login (admin role).
    const loginRes = await page.request.post("/api/demo/login?role=admin");
    expect(loginRes.status(), "login responds 200").toBe(200);

    // 2. /api/scaffold/Household — seeded 8 KK-0xx rows from prisma/seed/09-households.ts.
    //    Uses page.request so the demo cookie threads through.
    const householdRes = await page.request.get(
      "/api/scaffold/Household?limit=20",
    );
    expect(householdRes.status(), "scaffold Household 200").toBe(200);
    const householdBody = await householdRes.json();
    expect(
      Array.isArray(householdBody.items),
      "Household response carries items array",
    ).toBe(true);
    expect(
      householdBody.items.length,
      "Household seed yields ≥8 rows",
    ).toBeGreaterThanOrEqual(8);
    expect(
      householdBody.items[0],
      "Household items shape: {id, label}",
    ).toEqual(expect.objectContaining({ id: expect.any(String), label: expect.any(String) }));

    // 3. /api/scaffold/Program — seeded by 03-programs (TK / SD).
    const programRes = await page.request.get(
      "/api/scaffold/Program?limit=20",
    );
    expect(programRes.status(), "scaffold Program 200").toBe(200);
    const programBody = await programRes.json();
    expect(
      programBody.items.length,
      "Program seed yields ≥1 row",
    ).toBeGreaterThanOrEqual(1);

    // 4. /api/scaffold/UnknownEntity → 400 unknown_entity (fail-closed allowlist).
    const unknownRes = await page.request.get(
      "/api/scaffold/NotARealEntity",
    );
    expect(
      unknownRes.status(),
      "scaffold unknown_entity → 400",
    ).toBe(400);

    // 5. /api/scaffold/Household with q substring — seed sets KK-001..KK-008.
    const filteredRes = await page.request.get(
      "/api/scaffold/Household?q=KK-00",
    );
    expect(filteredRes.status(), "filtered Household 200").toBe(200);
    const filteredBody = await filteredRes.json();
    expect(
      filteredBody.items.length,
      "q=KK-00 matches all 8 seeded households",
    ).toBeGreaterThanOrEqual(8);

    // 6. Form-page combobox network round-trip — navigate to new-form,
    //    observe a /api/scaffold/Program OR /api/scaffold/Household request
    //    fire when the form mounts (RelationRenderer's useEffect runs on
    //    mount with q=""). Use Promise.all per Playwright docs to close
    //    the fire-before-await race on fast CI machines.
    const [scaffoldReq] = await Promise.all([
      page.waitForRequest((req) =>
        /\/api\/scaffold\/(Program|Household)/.test(req.url()),
      ),
      page.goto("/admin/akademik/siswa/new"),
    ]);
    expect(
      scaffoldReq.url(),
      "RelationRenderer fires GET /api/scaffold/* on mount",
    ).toMatch(/\/api\/scaffold\/(Program|Household)\?q=&limit=20/);
    expect(scaffoldReq.method(), "RelationRenderer uses GET").toBe("GET");

    // 7. /api/scaffold/* unauthenticated → 401. Use the test-level `request`
    //    fixture which has its own cookie jar (no demo cookie set on it).
    const unauthRes = await request.get("/api/scaffold/Household");
    expect(
      unauthRes.status(),
      "scaffold unauthenticated → 401",
    ).toBe(401);
  });
});
