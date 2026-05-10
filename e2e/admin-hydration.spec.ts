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

      // Wait up to 2 s for client hydration to flip Suspense placeholders.
      // We assert AFTER the wait so a slow-but-healthy hydrate still passes.
      const probe = await page.evaluate(async () => {
        await new Promise((r) => setTimeout(r, 2_000));
        return {
          mainTextLen:
            document.querySelector("main")?.innerText?.length ?? 0,
          hiddenSuspense: document.querySelectorAll(
            'div[hidden][id^="S:"]',
          ).length,
        };
      });

      expect(
        probe.mainTextLen,
        `<main> innerText must be non-empty on ${route}`,
      ).toBeGreaterThan(0);
      expect(
        probe.hiddenSuspense,
        `no residual hidden Suspense placeholders on ${route}`,
      ).toBe(0);
    });
  }
});
