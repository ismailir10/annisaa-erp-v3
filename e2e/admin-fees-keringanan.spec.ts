import { test, expect } from "@playwright/test";

// E2E for the Keringanan tab (/admin/fees → "Keringanan") — durable
// per-student fee adjustments, cycle 2026-08-13-keringanan-fee-adjustments
// (T10). Demo-mode cookie auth + selector/wait conventions match
// admin.spec.ts (see its "manual create dialog: combobox search → select
// student" test, which exercises the same StudentPicker this tab reuses via
// components/admin/student-picker.tsx, and its "academic-year roll-forward"
// test, which established the row-actions-menu + confirm-dialog pattern).
//
// Own file rather than a new describe block inside admin.spec.ts (602 lines
// already): this repo's convention for a single focused admin CRUD/tab
// feature is a dedicated `admin-<feature>.spec.ts` file (see
// admin-payments.spec.ts, admin-classes.spec.ts, admin-school-admin.spec.ts,
// admin-curriculum-objectives.spec.ts) — admin.spec.ts stays the
// cross-cutting smoke suite (dashboard, settings pages, bulk/manual tagihan).
//
// Generation-path coverage (bulk invoice generation applying the adjustment)
// is intentionally NOT exercised here — that belongs to vitest per the
// cycle doc's testing-gate policy (lib/finance/__tests__/apply-adjustments.
// test.ts, app/api/__tests__/invoices-generate-batch.test.ts). This spec
// only proves the durable-grant CRUD roundtrip through the UI.
//
// The Keringanan table has no "reason" column (student, komponen, jenis,
// nilai, masa berlaku, status, actions — see keringanan-tab.tsx), so a
// unique reason string alone can't locate the created row. The test still
// sends a unique timestamped reason (required field, and it is what makes
// the created record itself unique server-side), but locates the row in the
// table by student name + a distinct PERCENT value derived from Date.now()
// (1-89, always under the 100 cap) rendered as "NN%" in the Nilai column —
// collision-proof enough against leftover rows from prior runs sharing this
// real, non-resettable database (playwright.config.ts header: e2e rows
// leak between runs).

const ADMIN_USER_ID = "u_super_admin";

test.describe("Admin /admin/fees — Keringanan tab", () => {
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

  test("create via StudentPicker search → lists → deactivate → hidden under Aktif filter", async ({ page }) => {
    test.setTimeout(90_000);

    // Resolve a real ACTIVE student, an enabled fee component, and an
    // academic year via the API. These are hard assertions, not skips: the
    // demo seed creates all three, so their absence is a broken environment
    // or a broken seed — either way a failure worth surfacing, not a silently
    // green test.
    const [studentsRes, feesRes, yearsRes] = await Promise.all([
      page.request.get("/api/students?status=ACTIVE&pageSize=1"),
      page.request.get("/api/fee-components"),
      page.request.get("/api/academic-years"),
    ]);
    expect(studentsRes.ok(), "GET /api/students must succeed").toBeTruthy();
    expect(feesRes.ok(), "GET /api/fee-components must succeed").toBeTruthy();
    expect(yearsRes.ok(), "GET /api/academic-years must succeed").toBeTruthy();

    const studentsJson = await studentsRes.json();
    const student = studentsJson.data?.[0] as { id: string; name: string } | undefined;
    const fees = (await feesRes.json()) as Array<{
      id: string;
      label: string;
      status: string;
      isEnabled: boolean;
    }>;
    const fee = fees.find((f) => f.status === "ACTIVE" && f.isEnabled);
    const years = (await yearsRes.json()) as Array<{ id: string; name: string; status: string }>;
    const year = years.find((y) => y.status === "ACTIVE") ?? years[0];
    expect(student, "demo seed must provide an ACTIVE student").toBeTruthy();
    expect(fee, "demo seed must provide an enabled fee component").toBeTruthy();
    expect(year, "demo seed must provide an academic year").toBeTruthy();
    if (!student || !fee || !year) return; // narrowing only — the expects above already failed
    const firstLetter = student.name.slice(0, 1);

    const uniquePercent = (Date.now() % 89) + 1; // 1-89 — always under the PERCENT ≤ 100 cap
    const reason = `E2E Keringanan ${Date.now()}`;

    await page.goto("/admin/fees");
    await expect(page.getByRole("heading", { name: "Biaya & Tagihan" })).toBeVisible({ timeout: 15_000 });

    await page.getByRole("tab", { name: "Keringanan" }).click();
    await expect(page.getByRole("button", { name: "Tambah Keringanan" })).toBeVisible({ timeout: 10_000 });
    await page
      .waitForResponse((res) => res.url().includes("/api/student-fee-adjustments") && res.ok(), { timeout: 15_000 })
      .catch(() => undefined);

    // --- Create --------------------------------------------------------
    await page.getByRole("button", { name: "Tambah Keringanan" }).click();
    const dialog = page.getByRole("dialog", { name: "Tambah Keringanan" });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Siswa — StudentPicker async combobox, 1st combobox in the create form.
    const studentTrigger = dialog.getByRole("combobox").first();
    await expect(studentTrigger).toContainText("Pilih siswa...");
    await studentTrigger.click();
    const search = page.getByPlaceholder("Cari nama siswa...");
    await expect(search).toBeVisible({ timeout: 5_000 });
    await search.fill(firstLetter);
    const studentOption = page.getByRole("option").filter({ hasText: student.name }).first();
    await expect(studentOption).toBeVisible({ timeout: 5_000 });
    await studentOption.click();
    await expect(studentTrigger).toContainText(student.name);

    // Tahun Ajaran — 2nd combobox. Portal-rendered options — scope to page.
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: year.name, exact: true }).click();

    // Komponen Biaya — 3rd combobox.
    await dialog.getByRole("combobox").nth(2).click();
    await page.getByRole("option", { name: fee.label, exact: true }).click();

    // Jenis (Diskon) + Mode (Persen) keep their defaults — no need to touch
    // the 4th/5th comboboxes for this smoke test.
    await dialog.getByRole("spinbutton").fill(String(uniquePercent));
    await dialog.getByLabel("Alasan").fill(reason);

    await dialog.getByRole("button", { name: "Tambah Keringanan" }).click();
    await expect(page.getByText("Keringanan ditambahkan")).toBeVisible({ timeout: 15_000 });
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });

    // --- Assert it lists -------------------------------------------------
    const newRow = page
      .getByRole("row")
      .filter({ hasText: student.name })
      .filter({ hasText: `${uniquePercent}%` });
    await expect(newRow.first()).toBeVisible({ timeout: 15_000 });

    // --- Deactivate via row action + confirm dialog -----------------------
    await newRow.first().getByRole("button", { name: /Buka menu/i }).click();
    await page.getByRole("menuitem", { name: "Nonaktifkan" }).click();
    const confirmDialog = page.getByRole("alertdialog");
    await expect(confirmDialog).toBeVisible({ timeout: 10_000 });
    await confirmDialog.getByRole("button", { name: "Ya, Nonaktifkan" }).click();
    await expect(page.getByText("Keringanan dinonaktifkan")).toBeVisible({ timeout: 15_000 });
    await page
      .waitForResponse((res) => res.url().includes("/api/student-fee-adjustments") && res.ok(), { timeout: 15_000 })
      .catch(() => undefined);

    // --- Confirm it still exists (now Tidak Aktif) under "Semua Status" ---
    await page.getByRole("combobox", { name: "Filter Status" }).click();
    await page.getByRole("option", { name: "Semua Status", exact: true }).click();
    const inactiveRow = page
      .getByRole("row")
      .filter({ hasText: student.name })
      .filter({ hasText: `${uniquePercent}%` });
    await expect(inactiveRow.first()).toBeVisible({ timeout: 15_000 });
    await expect(inactiveRow.first()).toContainText("Tidak Aktif");

    // --- Assert the "Aktif" filter hides it --------------------------------
    await page.getByRole("combobox", { name: "Filter Status" }).click();
    await page.getByRole("option", { name: "Aktif", exact: true }).click();
    await expect(
      page.getByRole("row").filter({ hasText: student.name }).filter({ hasText: `${uniquePercent}%` }),
    ).toHaveCount(0, { timeout: 15_000 });
  });
});
