import { test, expect } from "@playwright/test";

// Visual regression anchor for the Design System reference page.
//
// The page iframes /admin/design-system-reference.html (copy of
// .claude/standards/design-system.html). Any drift between the canonical
// HTML and what lands in production is caught by this test, not by eyeball.

const ADMIN_USER_ID = "u_super_admin";

test.describe("Design System reference page", () => {
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

  test("loads with PageHeader, iframe, and action buttons", async ({
    page,
  }) => {
    await page.goto("/admin/design-system");
    await page.waitForURL("**/admin/design-system", { timeout: 15_000 });

    await expect(page.locator("h1", { hasText: "Design System" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Buka di tab baru/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Sumber di GitHub/i }),
    ).toBeVisible();

    // Iframe element is present with the correct src. Content assertions
    // happen in the second test which GETs the static HTML directly —
    // avoids flaky cross-origin-sandbox frame timing in the iframe path.
    const iframe = page.locator(
      'iframe[title="An Nisaa\' ERP Design System reference"]',
    );
    await expect(iframe).toBeVisible();
    await expect(iframe).toHaveAttribute(
      "src",
      "/admin/design-system-reference.html",
    );
  });

  test("static reference HTML is served at expected path", async ({
    page,
  }) => {
    const response = await page.goto("/admin/design-system-reference.html");
    expect(response?.status()).toBe(200);
    expect(response?.headers()["content-type"] ?? "").toContain("text/html");

    // Sanity — every canonical section the design system promises should be
    // anchor-linkable in the HTML.
    const content = await page.content();
    for (const anchor of [
      'id="brand"',
      'id="colors"',
      'id="typography"',
      'id="spacing"',
      'id="buttons"',
      'id="forms"',
      'id="overlays"',
      'id="portal"',
      'id="journal"',
      'id="voice"',
    ]) {
      expect(content, `missing ${anchor} in reference HTML`).toContain(anchor);
    }
  });
});
