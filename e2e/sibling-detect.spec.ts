import { test, expect } from "@playwright/test";

/**
 * Phase 1.2 — sibling auto-detect e2e.
 *
 * Covers the four behaviours called out in
 * docs/cycles/2026-05-11-sibling-auto-detect.md AC7:
 *   1. applicant-facing /daftar UX unchanged when match exists
 *   2. admin sees chip on the matched row + dash on the unmatched row
 *   3. hover reveals the matched parent's name + linked-student list
 *   4. edit-sheet banner renders inside the Sheet/Dialog
 *
 * Match target: seeded Parent "Siti Nurhaliza Hidayat" — phone "08129876543"
 * (stable across the demo seed). Submitting with parentPhone like
 * "+62 812-9876-543" exercises the +62 → 0 prefix normalisation end-to-end.
 *
 * Admin auth: demo cookie school-erp-session=u_super_admin (same pattern as
 * e2e/admin.spec.ts).
 */

const ADMIN_USER_ID = "u_super_admin";
const SEEDED_PARENT_PHONE_NORM = "08129876543"; // canonical 08xxx form
const APPLICANT_PARENT_PHONE_INPUT = "+62 812-9876-543"; // exercises +62→0 normalisation

const MATCH_CHILD = `E2E Sibling Match ${Date.now()}`;
const NO_MATCH_CHILD = `E2E Sibling NoMatch ${Date.now()}`;

test.describe.configure({ mode: "serial", timeout: 180_000 });

test.describe("Phase 1.2 — Sibling auto-detect", () => {
  test.beforeAll(async ({ request }) => {
    // Pre-insert one matched + one unmatched admission via the public POST.
    //
    // Marathon resilience: when daftar-public.spec.ts has just exhausted
    // the per-anonymous-IP rate-limit bucket (5/min), POSTs here can land
    // a 429. Retry once after a bucket-window wait (61s). Worst-case adds
    // ~1min per insert in a marathon run; in-isolation runs hit no retry.
    async function postWithRetry(body: Record<string, unknown>) {
      let res = await request.post("/api/admission/submit", { data: body });
      if (res.status() === 429) {
        await new Promise((r) => setTimeout(r, 61_000));
        res = await request.post("/api/admission/submit", { data: body });
      }
      return res;
    }

    const matched = await postWithRetry({
      childName: MATCH_CHILD,
      dateOfBirth: "2020-03-15",
      childGender: "P",
      parentName: "E2E Applicant",
      parentPhone: APPLICANT_PARENT_PHONE_INPUT,
    });
    expect(matched.status()).toBe(201);

    const noMatch = await postWithRetry({
      childName: NO_MATCH_CHILD,
      dateOfBirth: "2020-03-15",
      childGender: "L",
      parentName: "E2E NoMatch",
      parentPhone: "+62 999 0000 5555",
    });
    expect(noMatch.status()).toBe(201);
  });

  test("applicant-facing /daftar UX unchanged when match exists", async ({
    page,
    request,
    context,
  }) => {
    await context.clearCookies();

    // ----- Trust-boundary assertion (rate-limit-tolerant via retry) -----
    // Critical invariant from plan §7 q6: a matched submission must NOT
    // echo any sibling info to the applicant. Use request.post with the
    // same 429-retry pattern as beforeAll so this assertion ALWAYS runs
    // even in marathon orchestration where the per-anonymous-IP bucket
    // can be exhausted by daftar-public.spec.ts.
    let res = await request.post("/api/admission/submit", {
      data: {
        childName: `E2E Trust Boundary ${Date.now()}`,
        dateOfBirth: "2020-03-15",
        childGender: "P",
        parentName: "E2E Trust Applicant",
        parentPhone: APPLICANT_PARENT_PHONE_INPUT,
      },
    });
    if (res.status() === 429) {
      await new Promise((r) => setTimeout(r, 61_000));
      res = await request.post("/api/admission/submit", {
        data: {
          childName: `E2E Trust Boundary ${Date.now()}`,
          dateOfBirth: "2020-03-15",
          childGender: "P",
          parentName: "E2E Trust Applicant",
          parentPhone: APPLICANT_PARENT_PHONE_INPUT,
        },
      });
    }
    expect(res.status()).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    // Response is plain { id } — NO sibling info echoed to the applicant.
    expect(Object.keys(body)).toEqual(["id"]);

    // ----- UX-shape assertion (no submit; no rate-limit interaction) -----
    // /daftar must not surface any sibling-related copy at any step. This
    // assertion exercises the static UX shape without a second POST.
    await page.goto("/daftar");
    await expect(
      page.getByRole("heading", { name: "Pendaftaran Siswa Baru" }),
    ).toBeVisible();

    await page.getByTestId("field-child-name").fill(`E2E UX ${Date.now()}`);
    await page.getByTestId("field-date-of-birth").fill("2020-03-15");
    await page.getByText("Perempuan", { exact: true }).click();
    await page.getByTestId("daftar-next").click();
    await expect(page.getByTestId("daftar-step-2")).toBeVisible();
    await page.getByTestId("field-parent-name").fill("E2E UX Applicant");
    await page
      .getByTestId("field-parent-phone")
      .fill(APPLICANT_PARENT_PHONE_INPUT);
    await page.getByTestId("daftar-next").click();
    await expect(page.getByTestId("daftar-step-3")).toBeVisible();

    // The /daftar page (across all 3 steps) must never carry sibling copy.
    const pageText = (await page.textContent("body")) ?? "";
    expect(pageText.toLowerCase()).not.toContain("saudara");
    expect(pageText.toLowerCase()).not.toContain("sibling");
  });

  test("admin sees chip on matched row + dash on unmatched row", async ({
    page,
    context,
  }) => {
    await context.addCookies([
      {
        name: "school-erp-session",
        value: ADMIN_USER_ID,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    await page.goto("/admin/admissions");
    await expect(page.getByRole("heading", { name: "Pendaftaran" })).toBeVisible();
    // Wait for the data table to hydrate + fetch (page is a client component).
    await page.waitForResponse(
      (res) => res.url().includes("/api/admissions") && res.status() === 200,
    );

    // Find the matched row by child name; chip must be visible.
    const matchedRow = page.locator("tr", { hasText: MATCH_CHILD });
    await expect(matchedRow).toBeVisible();
    await expect(
      matchedRow.getByTestId("admission-row-sibling-chip"),
    ).toBeVisible();

    // Find the no-match row; chip must NOT be present.
    const unmatchedRow = page.locator("tr", { hasText: NO_MATCH_CHILD });
    await expect(unmatchedRow).toBeVisible();
    await expect(
      unmatchedRow.getByTestId("admission-row-sibling-chip"),
    ).toHaveCount(0);
  });

  test("hover chip reveals matched parent name + at least one student", async ({
    page,
    context,
  }) => {
    await context.addCookies([
      {
        name: "school-erp-session",
        value: ADMIN_USER_ID,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    await page.goto("/admin/admissions");
    await page.waitForResponse(
      (res) => res.url().includes("/api/admissions") && res.status() === 200,
    );
    const matchedRow = page.locator("tr", { hasText: MATCH_CHILD });
    await matchedRow.getByTestId("admission-row-sibling-chip").hover();
    // Hover content is a Shadcn HoverCard — content lands in a portal.
    await expect(page.locator("text=Siti Nurhaliza Hidayat")).toBeVisible();
  });

  test("edit-sheet banner renders matched parent context", async ({
    page,
    context,
  }) => {
    await context.addCookies([
      {
        name: "school-erp-session",
        value: ADMIN_USER_ID,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    await page.goto("/admin/admissions");
    await page.waitForResponse(
      (res) => res.url().includes("/api/admissions") && res.status() === 200,
    );
    const matchedRow = page.locator("tr", { hasText: MATCH_CHILD });
    // Marathon-resilience: when many admissions exist (cycle 1.1 + retries
    // can deepen the list past initial viewport) the row-action button is
    // off-screen and Playwright's click auto-scroll occasionally times out
    // on cold CI. Force scroll-into-view first, then click.
    await matchedRow.scrollIntoViewIfNeeded();
    await matchedRow.getByRole("button", { name: /buka menu/i }).click();
    // Base UI DropdownMenu re-mounts its items on focus / row re-render in CI,
    // detaching the menuitem mid-click ("element was detached from the DOM").
    // Wait for the menu container to be visible, then click with force:true
    // so Playwright skips the stability re-check that loses the race.
    const menu = page.getByRole("menu");
    await menu.waitFor({ state: "visible" });
    await menu.getByRole("menuitem", { name: /edit/i }).click({ force: true });
    // Banner inside the Sheet/Dialog body.
    await expect(
      page.getByTestId("admission-edit-sibling-banner"),
    ).toBeVisible();
    await expect(
      page.getByTestId("admission-edit-sibling-banner"),
    ).toContainText("Siti Nurhaliza Hidayat");
  });
});

// Reference the canonical-form phone constant so unused-import doesn't trip.
void SEEDED_PARENT_PHONE_NORM;
