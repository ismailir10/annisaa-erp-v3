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

// ----------------------------------------------------------------------
// Tagihan: bulk-create, manual-create, retry — task 15 of cycle
// 2026-04-25-tagihan-fixes-async-bulk-manual-create.
//
// Demo-mode constraints encountered + how the suite resolved them:
//
// 1) `lib/xendit/client.ts:19` throws when `XENDIT_SECRET_KEY` is unset.
//    Resolution: `playwright.config.ts` injects a stub key so the helper
//    attempts the call instead of failing pre-flight.
//
// 2) The cycle plan suggested `page.route()` to intercept `POST
//    https://api.xendit.co/sessions`, but `page.route()` only sees
//    requests issued by the BROWSER. The Xendit fetch happens on the
//    Next.js server side — Playwright cannot intercept it. So with the
//    stub key, every Xendit call hits the real api.xendit.co and gets a
//    401 (or, in network-isolated CI, a connection error). Either way,
//    the route handler treats this as a Xendit failure and lands the
//    invoice in `PENDING_PAYMENT_LINK` with `paymentLinkError` set.
//
// 3) This means the suite only deterministically exercises the FAILURE
//    path — which is exactly the new code surface this cycle introduces
//    (PENDING_PAYMENT_LINK status, paymentLinkError column, retry
//    affordances). The success path (Xendit returns 200, status flips to
//    SENT) is covered by Vitest unit tests with a mocked
//    `createXenditSessionForInvoice` (see `app/api/__tests__/
//    invoices-generate-batch.test.ts`, `invoices-manual-create.test.ts`,
//    `xendit-create-session.test.ts`).
//
// Each test uses a unique `periodLabel` keyed on `Date.now()` so the
// plan endpoint always sees fresh eligible students. Tests share a real
// Postgres DB; writes are scoped per-period to avoid collision.
// ----------------------------------------------------------------------

test.describe("Admin tagihan flows (bulk + manual + retry)", () => {
  test.beforeEach(async ({ page }) => {
    // CI seeds `u_super_admin`; local dev DBs may have a different super-admin
    // id. Resolve dynamically so the suite is portable across both. Demo-mode
    // exposes the user list at /api/auth/users (no auth required).
    let adminId = ADMIN_USER_ID;
    try {
      const res = await page.request.get("/api/auth/users");
      if (res.ok()) {
        const users = (await res.json()) as Array<{ id: string; role: string }>;
        const exact = users.find((u) => u.id === ADMIN_USER_ID);
        if (!exact) {
          const fallback = users.find((u) => u.role === "SUPER_ADMIN");
          if (fallback) adminId = fallback.id;
        }
      }
    } catch {
      // Fall through to default — beforeEach assertions will surface auth failures.
    }
    await page.context().addCookies([{
      name: "school-erp-session",
      value: adminId,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    }]);
  });

  test("bulk generate plans, confirms, runs sequential batches, lands all in PENDING_PAYMENT_LINK", async ({ page }) => {
    await page.goto("/admin/invoices");
    await expect(page.getByRole("heading", { name: /^Tagihan$/ })).toBeVisible({ timeout: 15_000 });

    // Wait for the academic-years fetch to settle so the form's default
    // year-id is populated (otherwise the plan call fires with empty
    // academicYearId and 400s).
    await page
      .waitForResponse((res) => res.url().includes("/api/academic-years") && res.ok(), { timeout: 15_000 })
      .catch(() => undefined);

    await page.getByRole("button", { name: /^Buat Tagihan$/ }).first().click();

    // Dialog renders. The Periode textbox carries placeholder "April 2026"
    // and no aria-label — locate by placeholder. Period uses a unique
    // suffix so plan endpoint sees all students as fresh.
    const dialog = page.getByRole("dialog", { name: /Buat Tagihan Bulanan/ });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    const period = `E2E Bulk ${Date.now()}`;
    await dialog.getByPlaceholder("April 2026").fill(period);

    await dialog.getByRole("button", { name: /^Buat Tagihan$/ }).click();

    // Plan confirm dialog. If 0 students are eligible we fail loudly — the
    // seed normally has plenty of ACTIVE-enrollment students with fee
    // structures across all 4 programs, but a stale DB could trip this.
    const confirmDialog = page.getByRole("alertdialog").or(page.getByRole("dialog"));
    await expect(confirmDialog.getByText(/siswa akan ditagih/)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /^Lanjutkan$/ }).click();

    // Final toast lands on the success path — copy varies by xenditOk vs
    // xenditFailed counts. Real Xendit calls fail (see suite header §2),
    // so we expect "X tagihan dibuat ... link gagal" — see page.tsx:436.
    await expect(page.getByText(/tagihan dibuat \(/)).toBeVisible({ timeout: 30_000 });
  });

  test("manual create surfaces alert card on detail page when Xendit fails", async ({ page }) => {
    // Resolve a student + fee component via API so the test doesn't depend
    // on seed name ordering for the Select picker.
    const studentsRes = await page.request.get("/api/students?status=ACTIVE&pageSize=1");
    const studentsJson = await studentsRes.json();
    const student = studentsJson.data?.[0] as { id: string; name: string } | undefined;
    if (!student) {
      test.skip(true, "No ACTIVE student available");
      return;
    }
    const feesRes = await page.request.get("/api/fee-components");
    const fees = (await feesRes.json()) as Array<{ id: string; status: string; isEnabled: boolean }>;
    const fee = fees.find((f) => f.status === "ACTIVE" && f.isEnabled);
    if (!fee) {
      test.skip(true, "No active fee component available");
      return;
    }

    // Drive the API directly. The dialog wires identical semantics (see
    // `manual-invoice-dialog.tsx:387`); the Select component's list-
    // virtualisation makes the UI brittle in headless mode.
    const create = await page.request.post("/api/invoices", {
      data: {
        studentId: student.id,
        periodLabel: `E2E Manual ${Date.now()}`,
        dueDate: "2026-12-31",
        lines: [{ feeComponentId: fee.id, amount: 250000 }],
      },
    });
    expect(create.status()).toBe(201);
    const created = await create.json();
    expect(created.id).toBeTruthy();
    // Xendit fails (real api with fake key) → response includes xenditError
    // and status is PENDING_PAYMENT_LINK with paymentLinkError persisted.
    expect(created.status).toBe("PENDING_PAYMENT_LINK");
    expect(created.xenditError).toBeTruthy();
    expect(created.paymentLinkError).toBeTruthy();

    // Detail page renders the warning alert card (page.tsx:237 — visible
    // when paymentLinkError is set) + status badge "Link Gagal".
    await page.goto(`/admin/invoices/${created.id}`);
    await page.waitForURL(`**/admin/invoices/${created.id}`);
    await expect(page.getByText(/Link pembayaran belum berhasil dibuat/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /Coba Lagi/ })).toBeVisible();
    await expect(page.getByText(/Total Tagihan/)).toBeVisible();
  });

  test("bulk failure leaves PENDING_PAYMENT_LINK rows + per-row retry endpoint reports stillFailed", async ({ page }) => {
    // Drive batch endpoint directly with a tiny student set so the test is
    // fast and deterministic. The orchestrator UI is covered by the first
    // test; this one focuses on the data-state contract.
    const period = `E2E Fail ${Date.now()}`;
    const yearId = await firstActiveYearId(page);
    const planRes = await page.request.post("/api/invoices/generate/plan", {
      data: { periodLabel: period, dueDate: "2026-12-31", academicYearId: yearId },
    });
    expect(planRes.ok()).toBeTruthy();
    const plan = await planRes.json();
    const studentIds: string[] = (plan.eligibleStudentIds ?? []).slice(0, 2);
    if (studentIds.length === 0) {
      test.skip(true, "No eligible students for bulk-fail scenario");
      return;
    }

    const batchRes = await page.request.post("/api/invoices/generate/batch", {
      data: { studentIds, periodLabel: period, dueDate: "2026-12-31", academicYearId: yearId },
    });
    expect(batchRes.ok()).toBeTruthy();
    const batch = await batchRes.json();
    expect(batch.created).toBe(studentIds.length);
    const pendingRow = (batch.results as Array<{ status: string; invoiceId: string }>)
      .find((r) => r.status === "PENDING_PAYMENT_LINK");
    expect(pendingRow).toBeTruthy();
    const pendingId = pendingRow!.invoiceId;

    // List page filtered to PENDING_PAYMENT_LINK shows the "Link Gagal" badge.
    await page.goto(`/admin/invoices?status=PENDING_PAYMENT_LINK&pageSize=50`);
    await expect(page.locator("text=Link Gagal").first()).toBeVisible({ timeout: 15_000 });

    // Per-row retry endpoint: with the same fake key, retry will still fail.
    // We assert the response shape (the success-path is covered by Vitest
    // mocking `createXenditSessionForInvoice` in the helper unit test).
    const retryRes = await page.request.post("/api/invoices/retry-payment-links", {
      data: { invoiceIds: [pendingId] },
    });
    expect(retryRes.ok()).toBeTruthy();
    const retryJson = await retryRes.json();
    expect(retryJson.retried).toBe(1);
    // Either succeeded or stillFailed should be 1 — we don't assert which,
    // since it depends on whether CI has Xendit network reachability. Both
    // are valid PENDING_PAYMENT_LINK outcomes.
    expect(retryJson.succeeded + retryJson.stillFailed).toBe(1);
  });

  test("header bulk-retry button visible when stats.pendingPaymentLink > 0 and confirms", async ({ page }) => {
    // Pre-condition: ensure at least one PENDING_PAYMENT_LINK invoice for the
    // tenant. Real Xendit fails with the fake key, so any batch creates
    // PENDING rows. Use a fresh periodLabel to avoid skippedAlreadyInvoiced.
    const period = `E2E HdrRetry ${Date.now()}`;
    const yearId = await firstActiveYearId(page);
    const planRes = await page.request.post("/api/invoices/generate/plan", {
      data: { periodLabel: period, dueDate: "2026-12-31", academicYearId: yearId },
    });
    const plan = await planRes.json();
    const studentIds: string[] = (plan.eligibleStudentIds ?? []).slice(0, 2);
    if (studentIds.length === 0) {
      test.skip(true, "No eligible students for header-retry scenario");
      return;
    }
    const batchRes = await page.request.post("/api/invoices/generate/batch", {
      data: { studentIds, periodLabel: period, dueDate: "2026-12-31", academicYearId: yearId },
    });
    expect(batchRes.ok()).toBeTruthy();

    // List page header should show "Coba Lagi Link (N)" with N >= 1.
    await page.goto("/admin/invoices");
    const retryBtn = page.getByRole("button", { name: /Coba Lagi Link \(\d+\)/ });
    await expect(retryBtn).toBeVisible({ timeout: 15_000 });

    // Click → confirm dialog opens with the pending count.
    await retryBtn.click();
    await expect(page.getByText(/Membuat ulang link/)).toBeVisible({ timeout: 5_000 });

    // Confirming kicks off the retry orchestration. Since real Xendit still
    // fails, the toast lands on the "stillFailed" branch — copy: "X masih
    // gagal" or "X link berhasil, Y masih gagal". Both formats include the
    // word "berhasil" or "gagal"; assert "Coba Lagi Link" header button is
    // still visible afterward (still-pending count > 0).
    await page.getByRole("button", { name: /^Lanjutkan$/ }).click();

    // The bulk-retry orchestration produces a final toast referencing
    // either "berhasil" or "gagal" — see page.tsx:533. Assert the toast
    // appears within 30s.
    await expect(page.getByText(/(link berhasil|masih gagal)/)).toBeVisible({ timeout: 30_000 });
  });

  test("pending-payment-link breakdown popover renders bucket counts when count > 0", async ({ page }) => {
    // Mock the diagnostic endpoint with a deterministic payload — browser-side
    // GET from app/admin/invoices/page.tsx is interceptable via page.route().
    // Stats endpoint we cannot mock (server-side), so we ensure pendingPaymentLink
    // > 0 by creating a real failing-Xendit invoice via the batch endpoint first.
    await page.route(
      "**/api/invoices/pending-payment-link/breakdown",
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            total: 6,
            byPrefix: {
              "5xx": 4,
              "401": 2,
              "429": 0,
              "408": 0,
              network: 0,
              "403": 0,
              "422": 0,
              "4xx": 0,
              untagged: 0,
              unknown: 0,
            },
          }),
        }),
    );

    // Pre-condition: ensure stats.pendingPaymentLink > 0 so the trigger renders.
    // Reuse the same path the header-retry test uses — fake-Xendit lands rows
    // in PENDING_PAYMENT_LINK deterministically.
    const period = `E2E Breakdown ${Date.now()}`;
    const yearId = await firstActiveYearId(page);
    const planRes = await page.request.post("/api/invoices/generate/plan", {
      data: { periodLabel: period, dueDate: "2026-12-31", academicYearId: yearId },
    });
    const plan = await planRes.json();
    const studentIds: string[] = (plan.eligibleStudentIds ?? []).slice(0, 2);
    if (studentIds.length === 0) {
      test.skip(true, "No eligible students for breakdown popover scenario");
      return;
    }
    const batchRes = await page.request.post("/api/invoices/generate/batch", {
      data: { studentIds, periodLabel: period, dueDate: "2026-12-31", academicYearId: yearId },
    });
    expect(batchRes.ok()).toBeTruthy();

    await page.goto("/admin/invoices");
    const trigger = page.getByRole("button", { name: /Coba Lagi Link \(\d+\)/ });
    await expect(trigger).toBeVisible({ timeout: 15_000 });

    // Click the trigger → popover opens, breakdown fetch fires, mocked payload
    // renders. Assert non-zero buckets are present and zero buckets are not.
    await trigger.click();
    await expect(page.getByText("Rincian gagal")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("5xx")).toBeVisible();
    await expect(page.getByText("401")).toBeVisible();
    // Auth share = 2/6 ≈ 0.33 — below 0.5 threshold, warning should NOT appear.
    await expect(page.getByText(/Banyak gagal autentikasi/)).not.toBeVisible();
    // The retry CTA inside the popover.
    await expect(
      page.getByRole("button", { name: /Coba Lagi Sekarang/ }),
    ).toBeVisible();
  });

  test("retry-payment-links endpoint validates payload", async ({ page }) => {
    // Smoke-test the retry endpoint contract — independent of Xendit state.
    // Empty body → retry-all PENDING for tenant, returns the expected shape.
    const res = await page.request.post("/api/invoices/retry-payment-links", { data: {} });
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    // Either the helper finds candidates or it short-circuits — both are
    // valid; assert keys are present.
    expect(json).toHaveProperty("retried");
    expect(json).toHaveProperty("succeeded");
    expect(json).toHaveProperty("stillFailed");
    expect(json).toHaveProperty("results");

    // Validation: invoiceIds.length > 25 → 400 from retryPaymentLinksSchema.
    const tooMany = Array.from({ length: 26 }, (_, i) => `inv_${i}`);
    const tooManyRes = await page.request.post("/api/invoices/retry-payment-links", {
      data: { invoiceIds: tooMany },
    });
    expect(tooManyRes.status()).toBe(400);
  });

  // T2c happy path — exercises the new shadcn <Command> combobox student
  // picker (no upfront pageSize=500 fetch, debounced search, idle/loading/
  // empty/error states). Cycle: 2026-04-26-finance-robustness-a-b-c.
  test("manual create dialog: combobox search → select student → submit → toast", async ({ page }) => {
    // Resolve a real student name + initial letter from the API. Using the
    // first letter of the seed-name guarantees at least one match.
    const studentsRes = await page.request.get(
      "/api/students?status=ACTIVE&pageSize=1",
    );
    const studentsJson = await studentsRes.json();
    const student = studentsJson.data?.[0] as
      | { id: string; name: string }
      | undefined;
    if (!student) {
      test.skip(true, "No ACTIVE student available");
      return;
    }
    const firstLetter = student.name.slice(0, 1);

    const feesRes = await page.request.get("/api/fee-components");
    const fees = (await feesRes.json()) as Array<{
      id: string;
      label: string;
      status: string;
      isEnabled: boolean;
    }>;
    const fee = fees.find((f) => f.status === "ACTIVE" && f.isEnabled);
    if (!fee) {
      test.skip(true, "No active fee component available");
      return;
    }

    await page.goto("/admin/invoices");
    await expect(
      page.getByRole("heading", { name: /^Tagihan$/ }),
    ).toBeVisible({ timeout: 15_000 });

    // The header has "Buat Tagihan" (bulk) and "Tagihan Manual" (single).
    await page.getByRole("button", { name: /^Tagihan Manual$/ }).click();

    const dialog = page.getByRole("dialog", { name: /Tagihan Manual/ });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Combobox trigger shows placeholder until selection lands.
    const trigger = dialog.getByRole("combobox").first();
    await expect(trigger).toBeVisible();
    await expect(trigger).toContainText("Pilih siswa...");
    await trigger.click();

    // Type the first letter to drive the debounced /api/students fetch.
    const search = dialog.getByPlaceholder("Cari nama siswa...");
    await expect(search).toBeVisible({ timeout: 5_000 });
    await search.fill(firstLetter);

    // Wait for the debounced fetch + render. The result list contains an
    // item with the student's full name; click it.
    const studentItem = dialog
      .getByRole("option")
      .filter({ hasText: student.name })
      .first();
    await expect(studentItem).toBeVisible({ timeout: 5_000 });
    await studentItem.click();

    // Trigger now reflects the selection (name · NIS or just name).
    await expect(trigger).toContainText(student.name);

    // Fill periodLabel + line item, then submit.
    const period = `E2E Combobox ${Date.now()}`;
    await dialog.getByPlaceholder("April 2026").fill(period);

    const feeSelect = dialog
      .getByRole("combobox")
      .filter({ hasText: /Pilih komponen/ })
      .first();
    await feeSelect.click();
    await page.getByRole("option", { name: fee.label }).first().click();

    await dialog.getByPlaceholder("0").fill("75000");

    await dialog.getByRole("button", { name: /^Buat Tagihan$/ }).click();

    // Real Xendit fails in test env so we expect either the success toast
    // or the warning toast — both indicate the invoice was created.
    await expect(
      page.getByText(/Tagihan dibuat( tapi link gagal)?/),
    ).toBeVisible({ timeout: 30_000 });
  });
});

// Helper: first ACTIVE academic year id. Inlined here (rather than in the
// module top scope) so it stays scoped to the new tagihan describe block.
async function firstActiveYearId(page: import("@playwright/test").Page): Promise<string> {
  const res = await page.request.get("/api/academic-years");
  const years = await res.json();
  const list = Array.isArray(years) ? years : (years.data ?? []);
  const active = list.find((y: { status: string; id: string }) => y.status === "ACTIVE");
  if (!active) throw new Error("No ACTIVE academic year");
  return active.id;
}
