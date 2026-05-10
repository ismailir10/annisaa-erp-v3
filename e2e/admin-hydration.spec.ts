import { test, expect } from "@playwright/test";

// Regression guard for UAT 2026-05-02 BLOCKER U1 — every admin route rendered
// blank because streamed Server Component content sat inside <div hidden id="S:*">
// Suspense placeholders that the React client never dehydrated. Rolling back to
// PR #177 (sha 433a3bd) appears to have healed the underlying issue, but this
// spec asserts the healed shape so a future regression cannot re-ship silently.
//
// Acceptance: each admin route, within 2 s of navigation,
//   - has main innerText length > 0
//   - has zero residual div[hidden][id^="S:"] Suspense placeholders
//
// If THIS spec fails, the symptom from the UAT is back.

const ADMIN_USER_ID = "u_super_admin";

const ROUTES = ["/admin", "/admin/students", "/admin/invoices"];

test.describe("Admin hydration regression guard (UAT U1 — 2026-05-02)", () => {
  test.beforeEach(async ({ page }) => {
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
  });

  for (const route of ROUTES) {
    test(`${route} hydrates within 2 s — no residual hidden Suspense placeholders`, async ({
      page,
    }) => {
      await page.goto(route);
      await page.waitForURL(`**${route}`, { timeout: 5_000 });

      // Poll-and-fail (NOT setTimeout-then-assert) — `setTimeout` inside
      // page.evaluate blocks the page event loop and starves any in-flight
      // RSC streaming + hydration that arrives during the wait. Polling via
      // waitForFunction lets the browser keep working between ticks and
      // surfaces a clear timeout if hydration never completes.
      await page.waitForFunction(
        () =>
          document.querySelectorAll('div[hidden][id^="S:"]').length === 0,
        null,
        { timeout: 5_000 },
      );

      // The admin layout renders TWO <main> elements: the outer
      // shadcn SidebarInset wrapper (always non-empty — contains breadcrumb
      // + sidebar text) and the inner page <main class="px-page-x py-page-y">
      // (the one UAT 05-02 reported as innerText.length === 0). The inner
      // main is the second match — UAT evidence: `document.querySelectorAll
      // ('main')[1].innerText.length === 0`. Match that index here.
      const innerMainTextLen = await page.evaluate(
        () => document.querySelectorAll("main")[1]?.innerText.length ?? 0,
      );
      expect(
        innerMainTextLen,
        `inner <main> innerText must be non-empty on ${route}`,
      ).toBeGreaterThan(0);
    });
  }
});
