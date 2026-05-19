import { test, expect } from "@playwright/test";

/**
 * Phase 1.1 — public admission entry e2e.
 *
 * Covers the three behaviours called out in
 * docs/cycles/2026-05-10-daftar-public-form.md AC5:
 *   1. happy path — three steps, valid data, 201 + confirmation state
 *   2. validation — empty childName does not advance step + inline error
 *   3. rate limit — direct POST to /api/admission/submit returns 429 after 5
 *
 * NO auth setup — /daftar + /api/admission/submit are public per proxy.ts
 * allow-list (Task 1). Tests clear cookies before each run so rate-limit
 * bucket isolation depends only on the source IP (always localhost in
 * the playwright orchestration).
 */

test.describe("Public admission entry — /daftar", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test("happy path — three steps, valid data, 201 confirmation", async ({ page }) => {
    const submitResponse = page.waitForResponse(
      (res) => res.url().endsWith("/api/admission/submit") && res.request().method() === "POST",
    );

    await page.goto("/daftar");
    await expect(page.getByRole("heading", { name: "Pendaftaran Siswa Baru" })).toBeVisible();
    await expect(page.getByTestId("daftar-step-1")).toBeVisible();

    // Step 1
    await page.getByTestId("field-child-name").fill("Aisyah Putri E2E");
    await page.getByTestId("field-date-of-birth").fill("2020-03-15");
    // childGender is a card-radio; clicking the visible label selects the sr-only input.
    await page.getByText("Perempuan", { exact: true }).click();
    await page.getByTestId("daftar-next").click();

    // Step 2
    await expect(page.getByTestId("daftar-step-2")).toBeVisible();
    await page.getByTestId("field-parent-name").fill("Ibu Fatimah E2E");
    await page.getByTestId("field-parent-phone").fill("0812-3456-7890");
    await page.getByTestId("daftar-next").click();

    // Step 3
    await expect(page.getByTestId("daftar-step-3")).toBeVisible();
    // notes is optional — submit without it.
    await page.getByTestId("daftar-submit").click();

    const res = await submitResponse;
    expect(res.status()).toBe(201);
    const body = (await res.json()) as { id: string };
    expect(body.id).toMatch(/^c[a-z0-9]{20,}$/i);

    await expect(page.getByTestId("daftar-confirmation")).toBeVisible();
    await expect(page.getByTestId("confirmation-child-name")).toHaveText("Aisyah Putri E2E");
  });

  test("validation — empty childName does not advance step", async ({ page }) => {
    await page.goto("/daftar");
    await expect(page.getByTestId("daftar-step-1")).toBeVisible();

    // Click Lanjut with childName blank.
    await page.getByTestId("daftar-next").click();

    // Still on step 1; step 2 not present in DOM.
    await expect(page.getByTestId("daftar-step-1")).toBeVisible();
    await expect(page.getByTestId("daftar-step-2")).not.toBeVisible();

    // Inline error rendered for childName (matches both client + server message).
    await expect(page.getByText("Nama anak wajib diisi")).toBeVisible();
  });

  test("rate limit — direct POST returns 429 with Retry-After header after the per-IP cap", async ({ request }) => {
    const VALID_BODY = {
      childName: "Rate Limit Test",
      dateOfBirth: "2020-03-15",
      childGender: "P",
      parentName: "Rate Test Parent",
      parentPhone: "081234567890",
    };

    // Fire 7 rapid POSTs from the same source. The bucket cap is 5/min/IP
    // (RATE_LIMIT_PER_MIN in app/api/admission/submit/route.ts). Earlier
    // tests in the same suite may have consumed bucket slots — this test
    // therefore asserts that AT LEAST one request returns 429, not a fixed
    // cutover index. The bucket is in-memory and shared across all calls
    // from localhost since the previous test's HTTP client. Hold every
    // response so the first 429 can be re-inspected for header + body shape.
    const responses: Awaited<ReturnType<typeof request.post>>[] = [];
    for (let i = 0; i < 7; i++) {
      responses.push(await request.post("/api/admission/submit", { data: VALID_BODY }));
    }

    const throttled = responses.find((r) => r.status() === 429);
    expect(throttled, "at least one of the 7 POSTs must hit the 5/min cap").toBeDefined();
    // Retry-After is set by the route as String(Math.ceil(RATE_WINDOW_MS / 1000)).
    // Assert the shape (positive integer string), not the literal "60", so the
    // window constant can change without breaking the test.
    expect(throttled!.headers()["retry-after"]).toMatch(/^\d+$/);
    const body = (await throttled!.json()) as { error: string };
    expect(body.error).toBe("rate_limited");
  });
});
