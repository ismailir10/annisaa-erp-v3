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

    // NOTE: the 401 unauth path is intentionally NOT exercised here — it is
    //       covered by the vitest route test at app/api/scaffold/[entity]/
    //       __tests__/route.test.ts. Reaching the unauth branch in CI Playwright
    //       requires a request with NO demo cookie, which causes getSession()
    //       to fall through to the Supabase path. Supabase env vars
    //       (NEXT_PUBLIC_SUPABASE_URL/ANON_KEY) are intentionally absent in the
    //       Playwright job (DEMO_MODE auth is the entire point), so reaching
    //       the Supabase fallback raises "Your project's URL and Key are
    //       required" → 500 instead of 401. Unit tests assert the 401 contract
    //       cleanly with mocked getSession.
  });
});

// p2-addresses-idn-chain extension — end-to-end smoke for the
// <AddressChainField> cascading-Select component wired into the Household
// edit form. Verifies the full fill→save→reload→assert round-trip against
// the seeded Household data (KK-001..KK-008 from prisma/seed/09-households.ts).
//
// Seed note: prisma/seed/09-households.ts creates 8 Households but NO
// Address rows — so the first visit to any Household edit page shows the
// <AddressChainField> in create-path mode (no initial values). The test
// fills the chain and saves, then reloads and asserts the saved values
// persisted via the detail page's initial-values lookup.
//
// Region note: Province BPS code "31" = official name "Daerah Khusus Ibukota
// Jakarta" (idn-area-data v4.0.1 stores the official full name, not the
// common abbreviation "DKI Jakarta"). Region seed
// (prisma/seed/01-regions.sql) is the full 91k-row snapshot — "31" is
// guaranteed present.
//
// Cycle: docs/cycles/2026-05-08-p2-addresses-idn-chain.md (T6)
test.describe("admin addresses — keluarga edit chain fill", () => {
  test("keluarga edit fills address chain end-to-end", async ({ page }) => {
    // 1. Demo-mode login.
    const loginRes = await page.request.post("/api/demo/login?role=admin");
    expect(loginRes.status(), "login responds 200").toBe(200);

    // 2. Resolve first Household id from the scaffold relation-list endpoint.
    //    The seed creates 8 KK-0xx rows; we pick whichever sorts first.
    const householdListRes = await page.request.get(
      "/api/scaffold/Household?limit=1",
    );
    expect(householdListRes.status(), "scaffold Household list 200").toBe(200);
    const householdListBody = await householdListRes.json();
    expect(
      householdListBody.items?.length,
      "at least 1 Household seeded",
    ).toBeGreaterThanOrEqual(1);
    const householdId: string = householdListBody.items[0].id;

    // 3. Navigate directly to the Household edit page — skips the list→detail
    //    navigation which adds one extra click and page-load for no canary value.
    await page.goto(`/admin/akademik/keluarga/${householdId}/edit`);

    // 4. Wait for the AddressChainField section heading to appear.
    //    The section renders an <h3>Alamat</h3> and a Provinsi label.
    await expect(
      page.locator("h3", { hasText: "Alamat" }),
      "AddressChainField heading 'Alamat' visible",
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator('label[for="acf-province"]'),
      "Provinsi label visible",
    ).toBeVisible();

    // 5. Verify provinces loaded (the /api/regions/provinces route fires on
    //    component mount — wait until the select trigger is no longer showing
    //    the spinner by asserting the trigger is not disabled).
    const provinceTrigger = page.locator("#acf-province");
    await expect(
      provinceTrigger,
      "Provinsi trigger enabled after provinces load",
    ).not.toBeDisabled({ timeout: 10_000 });

    // 6. Select Provinsi — "Daerah Khusus Ibukota Jakarta" (BPS code "31").
    //    Note: idn-area-data v4.0.1 stores the official full name, not
    //    the common abbreviation "DKI Jakarta". Clicking first-available is
    //    avoided to ensure a predictable regency/district chain for assertion.
    //    Shadcn <Select> renders as a button[role=combobox]; click trigger to
    //    open popover, then click the exact option text.
    await provinceTrigger.click();
    await page.getByRole("option", { name: "Daerah Khusus Ibukota Jakarta" }).click();

    // 7. Wait for regency trigger to become enabled (regencies load on province
    //    change), then select the first option.
    const regencyTrigger = page.locator("#acf-regency");
    await expect(
      regencyTrigger,
      "Kabupaten/Kota trigger enabled after regencies load",
    ).not.toBeDisabled({ timeout: 10_000 });
    await regencyTrigger.click();
    // Pick "KOTA JAKARTA PUSAT" or whatever first option appears.
    await page.getByRole("option").first().click();

    // 8. Wait for district trigger to become enabled, select first option.
    const districtTrigger = page.locator("#acf-district");
    await expect(
      districtTrigger,
      "Kecamatan trigger enabled after districts load",
    ).not.toBeDisabled({ timeout: 10_000 });
    await districtTrigger.click();
    await page.getByRole("option").first().click();

    // 9. Village (Kelurahan/Desa) is optional per spec Spec §1 — select first
    //    option if available; the save button doesn't require it.
    const villageTrigger = page.locator("#acf-village");
    await expect(
      villageTrigger,
      "Kelurahan/Desa trigger enabled after villages load",
    ).not.toBeDisabled({ timeout: 10_000 });
    await villageTrigger.click();
    await page.getByRole("option").first().click();

    // 10. Fill street-level inputs.
    await page.locator("#acf-street").fill("Jalan Test 123");
    await page.locator("#acf-rt").fill("001");
    await page.locator("#acf-rw").fill("002");

    // 11. Click "Simpan Alamat". The button is the direct child of
    //     AddressChainField with text "Simpan Alamat".
    const simpanBtn = page.getByRole("button", { name: "Simpan Alamat" });
    await expect(simpanBtn, "Simpan Alamat button visible").toBeVisible();
    await simpanBtn.click();

    // 12. Wait for the success toast "Alamat berhasil disimpan." from
    //     components/forms/address-chain-field.tsx:254 (toast.success).
    await expect(
      page.locator("text=Alamat berhasil disimpan"),
      "success toast appears after save",
    ).toBeVisible({ timeout: 10_000 });

    // 13. Reload to verify persistence — the edit page fetches the Household
    //     (including its Address relation) from the DB on every RSC render.
    await page.reload();

    // 14. After reload the AddressChainField rehydrates with initialValues from
    //     the server. The SelectTrigger renders the stored label text inside the
    //     trigger. Assert at minimum that the Provinsi field is no longer on its
    //     placeholder (i.e. it now shows a province name, not "Pilih provinsi").
    //     Full chain assertion via SelectValue content.
    await expect(
      page.locator("h3", { hasText: "Alamat" }),
      "AddressChainField still rendered after reload",
    ).toBeVisible({ timeout: 10_000 });

    // Assert street and RT/RW inputs retained values.
    await expect(
      page.locator("#acf-street"),
      "streetLine persists after reload",
    ).toHaveValue("Jalan Test 123");
    await expect(
      page.locator("#acf-rt"),
      "rt persists after reload",
    ).toHaveValue("001");
    await expect(
      page.locator("#acf-rw"),
      "rw persists after reload",
    ).toHaveValue("002");

    // Assert province trigger no longer shows placeholder — a non-empty
    // SelectValue is the visual indication the initial value was hydrated.
    // The trigger text includes the province label when a value is selected.
    await expect(
      page.locator("#acf-province"),
      "Provinsi select shows stored value (not placeholder)",
    ).not.toContainText("Pilih provinsi", { timeout: 10_000 });
  });
});
