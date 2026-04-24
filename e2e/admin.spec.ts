import { test, expect } from "@playwright/test";

// Demo mode E2E tests — discovers user ID from /api/auth/users and sets
// session cookie directly to avoid rate-limit on repeated beforeEach calls.

const ADMIN_USER_ID = "u_super_admin"; // Primary owner — SUPER_ADMIN

test.describe("Admin flows", () => {
  test.beforeEach(async ({ page }) => {
    // Set demo session cookie directly — avoids /api/auth/login rate limit
    await page.context().addCookies([{
      name: "school-erp-session",
      value: ADMIN_USER_ID,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    }]);
    await page.goto("/admin");
    await page.waitForURL("**/admin", { timeout: 15_000 });
  });

  test("SUPER_ADMIN demo user sees full nav incl. SDM group + Karyawan", async ({ page }) => {
    // SUPER_ADMIN gets every permission — SDM group and Karyawan link must render.
    await expect(page.getByRole("button", { name: "SDM" })).toBeVisible();
    await expect(page.locator('a[href="/admin/employees"]').first()).toBeVisible();
    await expect(page.locator('a[href="/admin/payroll"]').first()).toBeVisible();
  });

  test("dashboard loads with stats", async ({ page }) => {
    await expect(page.locator("text=Dasbor")).toBeVisible();
    await expect(page.locator("text=TOTAL KARYAWAN")).toBeVisible();
    await expect(page.locator("text=HADIR HARI INI")).toBeVisible();
  });

  test("employee list loads", async ({ page }) => {
    await page.goto("/admin/employees");
    await page.waitForURL("**/admin/employees");
    await expect(page.locator("text=karyawan terdaftar")).toBeVisible();
  });

  test("employee detail loads with salary tab", async ({ page }) => {
    // Navigate via API to avoid depending on employee name in the table
    const res = await page.request.get("/api/employees?pageSize=1");
    const json = await res.json();
    const empId = json.data?.[0]?.id;
    if (!empId) return;
    await page.goto(`/admin/employees/${empId}`);
    await page.waitForURL(`**/admin/employees/${empId}`);
    await expect(page.getByRole("tab", { name: "Profil" })).toBeVisible();
    await page.getByRole("tab", { name: "Gaji" }).click();
    await expect(page.locator("text=Gaji Pokok")).toBeVisible();
  });

  test("attendance page loads", async ({ page }) => {
    await page.goto("/admin/attendance");
    await page.waitForURL("**/admin/attendance");
    await expect(page.locator("text=Kehadiran Hari Ini")).toBeVisible();
  });

  test("monthly attendance grid loads", async ({ page }) => {
    await page.goto("/admin/attendance/monthly");
    await expect(page.locator("text=Kehadiran Bulanan")).toBeVisible({ timeout: 15_000 });
  });

  test("payroll list loads", async ({ page }) => {
    await page.goto("/admin/payroll");
    await page.waitForURL("**/admin/payroll");
    await expect(page.getByRole("heading", { name: /Penggajian/i }).first()).toBeVisible({ timeout: 15_000 });
  });

  test("settings pages load", async ({ page }) => {
    await page.goto("/admin/settings/campuses");
    await page.waitForURL("**/admin/settings/campuses");
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 15_000 });

    await page.goto("/admin/settings/holidays");
    await page.waitForURL("**/admin/settings/holidays");
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 15_000 });

    await page.goto("/admin/settings/salary-components");
    await page.waitForURL("**/admin/settings/salary-components");
    await expect(page.locator("text=Gaji Pokok")).toBeVisible({ timeout: 15_000 });
  });

  test("can open create employee dialog from list", async ({ page }) => {
    await page.goto("/admin/employees");
    await page.waitForURL("**/admin/employees");
    await page.getByRole("button", { name: /Tambah/ }).click();
    await expect(page.getByRole("dialog").getByRole("heading", { name: "Tambah Karyawan" })).toBeVisible({ timeout: 15_000 });
  });

  test("deleted flat assessment-templates URL redirects to nested", async ({ page }) => {
    await page.goto("/admin/assessment-templates");
    await expect(page).toHaveURL("/admin/assessments/templates");
    await expect(page.getByRole("heading", { name: /Template Penilaian/i })).toBeVisible();
  });

  test("program deactivate sets status INACTIVE and hides from Aktif filter", async ({ page }) => {
    // Pick an ACTIVE program via API so we don't depend on seed ordering
    const list = await page.request.get("/api/programs");
    const programs = await list.json();
    const target = (programs as Array<{ id: string; name: string; status: string }>)
      .find(p => p.status === "ACTIVE");
    if (!target) {
      test.skip(true, "No ACTIVE program to deactivate");
      return;
    }

    const put = await page.request.put(`/api/programs/${target.id}`, {
      data: { status: "INACTIVE" },
    });
    expect(put.ok()).toBeTruthy();

    // Verify list under Aktif filter no longer includes it
    const after = await page.request.get("/api/programs");
    const afterJson = await after.json();
    const stillActive = (afterJson as Array<{ id: string; status: string }>)
      .find(p => p.id === target.id && p.status === "ACTIVE");
    expect(stillActive).toBeUndefined();

    // Restore to ACTIVE so other tests / subsequent runs stay idempotent
    await page.request.put(`/api/programs/${target.id}`, {
      data: { status: "ACTIVE" },
    });
  });

  test("class-section deactivate sets status INACTIVE and hides from Aktif filter", async ({ page }) => {
    const list = await page.request.get("/api/class-sections");
    const sections = await list.json();
    const target = (sections as Array<{ id: string; name: string; status: string }>)
      .find(s => s.status === "ACTIVE");
    if (!target) {
      test.skip(true, "No ACTIVE class section to deactivate");
      return;
    }

    const put = await page.request.put(`/api/class-sections/${target.id}`, {
      data: { status: "INACTIVE" },
    });
    expect(put.ok()).toBeTruthy();

    const after = await page.request.get("/api/class-sections");
    const afterJson = await after.json();
    const stillActive = (afterJson as Array<{ id: string; status: string }>)
      .find(s => s.id === target.id && s.status === "ACTIVE");
    expect(stillActive).toBeUndefined();

    // Restore to ACTIVE so other tests / subsequent runs stay idempotent
    await page.request.put(`/api/class-sections/${target.id}`, {
      data: { status: "ACTIVE" },
    });
  });

  test("enrollment deactivate sets status WITHDRAWN and hides from Aktif filter", async ({ page }) => {
    const list = await page.request.get("/api/enrollments?pageSize=100&status=ACTIVE");
    const json = await list.json();
    const target = (json.data as Array<{ id: string; status: string }> | undefined)?.[0];
    if (!target) {
      test.skip(true, "No ACTIVE enrollment to deactivate");
      return;
    }

    const put = await page.request.put(`/api/enrollments/${target.id}`, {
      data: { status: "WITHDRAWN" },
    });
    expect(put.ok()).toBeTruthy();

    const after = await page.request.get("/api/enrollments?pageSize=100&status=ACTIVE");
    const afterJson = await after.json();
    const stillActive = (afterJson.data as Array<{ id: string }> | undefined)
      ?.find(e => e.id === target.id);
    expect(stillActive).toBeUndefined();

    // Restore to ACTIVE so other tests / subsequent runs stay idempotent
    await page.request.put(`/api/enrollments/${target.id}`, {
      data: { status: "ACTIVE" },
    });
  });

  test("student-attendance override updates status; void flips isVoided and hides row", async ({ page }) => {
    const list = await page.request.get("/api/student-attendance?mode=list&pageSize=100");
    const json = await list.json();
    const target = (json.data as Array<{ id: string; status: string; notes: string | null }> | undefined)?.[0];
    if (!target) {
      test.skip(true, "No student-attendance record available");
      return;
    }

    // Flip status via override (PUT) — pick a different status than current
    const nextStatus = target.status === "PRESENT" ? "SICK" : "PRESENT";
    const put = await page.request.put(`/api/student-attendance/${target.id}`, {
      data: { status: nextStatus, notes: "e2e override" },
    });
    expect(put.ok()).toBeTruthy();
    const putJson = await put.json();
    expect(putJson.status).toBe(nextStatus);

    // Restore original status/notes so subsequent runs stay idempotent
    await page.request.put(`/api/student-attendance/${target.id}`, {
      data: { status: target.status, notes: target.notes },
    });

    // Void (DELETE) — should flip isVoided and hide from list
    const del = await page.request.delete(`/api/student-attendance/${target.id}`);
    expect(del.ok()).toBeTruthy();

    const after = await page.request.get("/api/student-attendance?mode=list&pageSize=100");
    const afterJson = await after.json();
    const stillVisible = (afterJson.data as Array<{ id: string }> | undefined)
      ?.find(r => r.id === target.id);
    expect(stillVisible).toBeUndefined();

    // Un-void directly via prisma is not available here; record stays voided.
    // Idempotency: the next run picks a different first record (page size 100
    // surfaces plenty of alternates), and a voided record is a realistic state
    // for the list to handle.
  });

  test("payroll detail shows employee lines", async ({ page }) => {
    await page.goto("/admin/payroll");
    const payrollLink = page.locator("a[href*='/admin/payroll/']").first();
    if (await payrollLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await payrollLink.click();
      await page.waitForURL("**/admin/payroll/**");
      await expect(page.getByRole("heading").first()).toBeVisible();
    }
  });

  test("payroll DRAFT run can be edited; non-DRAFT returns 409", async ({ page }) => {
    // API-level coverage — pick a DRAFT and a non-DRAFT run (if any) from the list.
    const listRes = await page.request.get("/api/payroll?pageSize=50");
    if (!listRes.ok()) return;
    const list = await listRes.json();
    const runs: Array<{ id: string; status: string; periodStart: string; periodEnd: string; actualWorkDays: number }> =
      list.data ?? [];

    const draft = runs.find((r) => r.status === "DRAFT");
    if (draft) {
      // Happy path — edit actualWorkDays (no period shift → avoids overlap guard).
      const nextDays = (draft.actualWorkDays ?? 0) + 1;
      const put = await page.request.put(`/api/payroll/${draft.id}`, {
        data: { actualWorkDays: nextDays },
      });
      expect(put.ok()).toBe(true);
      const after = await put.json();
      expect(after.actualWorkDays).toBe(nextDays);

      // Restore original value so re-runs stay idempotent.
      await page.request.put(`/api/payroll/${draft.id}`, {
        data: { actualWorkDays: draft.actualWorkDays },
      });
    }

    const nonDraft = runs.find((r) => r.status !== "DRAFT");
    if (nonDraft) {
      // Negative path — non-DRAFT rejects edit with 409, UI hides Edit button.
      const put = await page.request.put(`/api/payroll/${nonDraft.id}`, {
        data: { actualWorkDays: (nonDraft.actualWorkDays ?? 0) + 1 },
      });
      expect(put.status()).toBe(409);

      await page.goto(`/admin/payroll/${nonDraft.id}`);
      await page.waitForURL(`**/admin/payroll/${nonDraft.id}`);
      await expect(page.getByTestId("payroll-edit-btn")).toHaveCount(0);
    }
  });

  test("teaching-assignment role edit persists and list reflects new role", async ({ page }) => {
    const list = await page.request.get("/api/teaching-assignments");
    if (!list.ok()) {
      test.skip(true, "Teaching assignments endpoint unavailable");
      return;
    }
    const rows = (await list.json()) as Array<{ id: string; role: string }>;
    const target = rows[0];
    if (!target) {
      test.skip(true, "No teaching assignment available");
      return;
    }

    const nextRole = target.role === "HOMEROOM" ? "ASSISTANT" : "HOMEROOM";
    const put = await page.request.put(`/api/teaching-assignments/${target.id}`, {
      data: { role: nextRole },
    });
    expect(put.ok()).toBeTruthy();
    const putJson = await put.json();
    expect(putJson.role).toBe(nextRole);

    // Verify list re-fetch surfaces the new role
    const after = await page.request.get("/api/teaching-assignments");
    const afterRows = (await after.json()) as Array<{ id: string; role: string }>;
    const updated = afterRows.find((r) => r.id === target.id);
    expect(updated?.role).toBe(nextRole);

    // Restore original role so subsequent runs stay idempotent
    await page.request.put(`/api/teaching-assignments/${target.id}`, {
      data: { role: target.role },
    });
  });

  test("admission status transitions follow the state machine", async ({ page }) => {
    // Find an INQUIRY admission to exercise the happy-path + illegal-jump guard
    const list = await page.request.get("/api/admissions?status=INQUIRY&pageSize=1");
    expect(list.ok()).toBeTruthy();
    const json = await list.json();
    const target = json.data?.[0] as { id: string; status: string } | undefined;
    if (!target) {
      test.skip(true, "No INQUIRY admission available");
      return;
    }

    // Happy-path: INQUIRY → VISIT_SCHEDULED is allowed
    const advance = await page.request.put(`/api/admissions/${target.id}`, {
      data: { status: "VISIT_SCHEDULED" },
    });
    expect(advance.ok()).toBeTruthy();
    const advanced = await advance.json();
    expect(advanced.status).toBe("VISIT_SCHEDULED");

    // Negative: VISIT_SCHEDULED → REGISTERED skips states and must return 400
    const skip = await page.request.put(`/api/admissions/${target.id}`, {
      data: { status: "REGISTERED" },
    });
    expect(skip.status()).toBe(400);
    const skipJson = await skip.json();
    expect(String(skipJson.error)).toMatch(/Invalid status transition/i);

    // Restore original status so subsequent runs stay idempotent.
    // INQUIRY is not in allowed[VISIT_SCHEDULED], so we go VISIT_SCHEDULED → CANCELLED
    // only as a last resort; prefer idempotent restore via direct DB is unavailable.
    // Instead, leave the row at VISIT_SCHEDULED — the test seeks "an INQUIRY row"
    // and the seed ships multiple; subsequent runs will pick the next INQUIRY row.
  });

  test("invoice void flips status to CANCELLED", async ({ page }) => {
    // Find a DRAFT or SENT invoice to void (server accepts either)
    const list = await page.request.get("/api/invoices?status=DRAFT&pageSize=1");
    expect(list.ok()).toBeTruthy();
    const json = await list.json();
    const target = json.data?.[0] as { id: string; status: string } | undefined;
    if (!target) {
      test.skip(true, "No DRAFT invoice available to void");
      return;
    }

    const res = await page.request.post(`/api/invoices/${target.id}/void`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);

    // Confirm the invoice is now CANCELLED
    const detail = await page.request.get(`/api/invoices/${target.id}`);
    expect(detail.ok()).toBeTruthy();
    const detailJson = await detail.json();
    expect(detailJson.status).toBe("CANCELLED");

    // Void is non-reversible via API (matches T4 pattern — consumes head of DRAFT list
    // across runs; seed ships enough DRAFT invoices that this is safe in practice).
  });

  test("admin can open Buku Penghubung template config and monitoring", async ({ page }) => {
    await page.goto("/admin/student-journal");
    await expect(page.getByRole("heading", { name: /Buku Penghubung/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("tab", { name: "Sekolah" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Rumah" })).toBeVisible();

    await page.goto("/admin/student-journal/monitoring");
    await page.waitForURL("**/admin/student-journal/monitoring");
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 15_000 });
  });
});
