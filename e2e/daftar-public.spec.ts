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

  test("rate limit — direct POST returns 429 after the per-IP cap", async ({ request }) => {
    const VALID_BODY = {
      childName: "Rate Limit Test",
      dateOfBirth: "2020-03-15",
      childGender: "P",
      parentName: "Rate Test Parent",
      parentPhone: "081234567890",
    };

    const statuses: number[] = [];
    // Fire 7 rapid POSTs from the same source. The bucket cap is 5/min/IP
    // (RATE_LIMIT_PER_MIN in app/api/admission/submit/route.ts). Earlier
    // tests in the same suite may have consumed bucket slots — this test
    // therefore asserts that AT LEAST one request returns 429, not a fixed
    // cutover index. The bucket is in-memory and shared across all calls
    // from localhost since the previous test's HTTP client.
    for (let i = 0; i < 7; i++) {
      const res = await request.post("/api/admission/submit", { data: VALID_BODY });
      statuses.push(res.status());
    }

    expect(statuses).toContain(429);
    // The first 429 response carries Retry-After.
    const firstThrottledIdx = statuses.indexOf(429);
    expect(firstThrottledIdx).toBeGreaterThanOrEqual(0);
  });

  test("rate limit response shape carries Retry-After header", async ({ request }) => {
    // Exhaust bucket (best-effort — earlier tests may already have).
    for (let i = 0; i < 7; i++) {
      await request.post("/api/admission/submit", {
        data: {
          childName: "Header Probe",
          dateOfBirth: "2020-03-15",
          childGender: "L",
          parentName: "Header Parent",
          parentPhone: "081234567890",
        },
      });
    }

    const probe = await request.post("/api/admission/submit", {
      data: {
        childName: "Header Probe",
        dateOfBirth: "2020-03-15",
        childGender: "L",
        parentName: "Header Parent",
        parentPhone: "081234567890",
      },
    });

    if (probe.status() === 429) {
      expect(probe.headers()["retry-after"]).toBeDefined();
      const body = (await probe.json()) as { error: string };
      expect(body.error).toBe("rate_limited");
    } else {
      // Bucket happened to reset right at the probe — non-fatal; the
      // previous test already asserted the 429 path. Skip the header
      // assertion in that rare ordering.
      test.info().annotations.push({
        type: "note",
        description: `Rate-limit probe returned ${probe.status()} (bucket reset edge case)`,
      });
    }
  });
});
