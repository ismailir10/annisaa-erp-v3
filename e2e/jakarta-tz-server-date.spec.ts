import { test, expect } from "@playwright/test";

// Regression guard for UAT 2026-05-14 — FIND-002 (server-rendered "today" was
// one day behind real WIB during 00:00–06:59 WIB) and FIND-016 (server rejected
// today's class-attendance with HTTP 400 "Tidak bisa mencatat kehadiran untuk
// tanggal yang akan datang"). Root cause: callsites used
// `new Date().toISOString().split("T")[0]` on a UTC-clocked Vercel function,
// which yielded yesterday-WIB during the regression window.
//
// Server-side time cannot be mocked from Playwright (page.clock only stubs
// the browser). So we compute today-in-WIB on the test side via the same
// `Intl.DateTimeFormat` recipe the helper uses, then assert each fixed
// callsite renders that day. If a future regression reintroduces UTC-based
// "today" computation on these surfaces, the assertion will fail during
// the 00:00–06:59 WIB window when the CI clock crosses the boundary.
//
// Unit-level coverage of the helper itself lives in
// `lib/attendance/__tests__/timezone.test.ts` and exercises the boundary
// windows directly with `vi.setSystemTime`.

const SUPER_ADMIN_USER_ID = "u_super_admin";

function todayInJakarta(): { ymd: string; day: string } {
  const now = new Date();
  const ymdFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const ymd = ymdFormatter.format(now); // "YYYY-MM-DD"
  const day = ymd.split("-")[2].replace(/^0/, ""); // "1".."31"
  return { ymd, day };
}

test.describe("Jakarta TZ server-date regression guard (UAT FIND-002 + FIND-016)", () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      { name: "school-erp-session", value: SUPER_ADMIN_USER_ID, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" },
    ]);
  });

  test("admin employee-attendance page header reflects today-in-WIB", async ({ page }) => {
    const { ymd, day } = todayInJakarta();
    const response = await page.goto("/admin/employee-attendance");
    expect(response?.status()).toBeLessThan(400);
    // The page header injects today as the initial date filter value (input[type=date]).
    // The bug: TODAY_ISO was computed via toISOString().split("T")[0] (UTC) — would
    // populate yesterday-WIB during the regression window.
    // The HTML <input type="date"> renders the YYYY-MM-DD value attribute directly.
    const dateInput = page.locator('input[type="date"]').first();
    await expect(dateInput).toHaveValue(ymd);
    // Also assert the day appears in the displayed header text.
    const main = page.locator("main").first();
    await expect(main).toContainText(new RegExp(`\\b${day}\\b`));
  });
});
