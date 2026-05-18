import { test, expect, type Page } from "@playwright/test";

/**
 * T12 — kesiswaan CRUD parity.
 *
 * Round-trip every schema-editable Student field through the admin UI:
 *   1. Open the "Tambah Siswa" dialog on /admin/students
 *   2. Fill name, nickname, gender, dateOfBirth, address, NIS, NISN,
 *      birthPlace, NIK, kkNumber, livingWith, notes, status
 *   3. Submit → redirects to /admin/students/[id]
 *   4. Re-fetch via the API and assert each field landed verbatim
 *   5. Open Edit, change `notes`, save, assert persistence
 *
 * Auth: demo cookie school-erp-session=u_super_admin (e2e/admin.spec.ts pattern).
 * Isolation: each test creates a fresh student keyed on Date.now(). Student
 * rows have no DELETE in the admin surface — cleanup leaves the row INACTIVE
 * so a marathon run does not accumulate noise.
 */

const ADMIN_USER_ID = "u_super_admin";

async function loginAsAdmin(page: Page) {
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
}

test.describe("Admin students — full-field CRUD round-trip", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("create with every field, reopen detail, assert each value intact; edit notes, assert persistence", async ({
    page,
  }) => {
    const suffix = Date.now();
    const payload = {
      name: `E2E Full ${suffix}`,
      nickname: "Eef",
      gender: "P",
      dateOfBirth: "2018-04-12",
      address: "Jl. Mawar No. 7, Bandung",
      nis: `NIS${suffix}`,
      nisn: `NISN${suffix}`,
      birthPlace: "Bandung",
      nik: `3273${String(suffix).slice(-12).padStart(12, "0")}`,
      kkNumber: `3273${String(suffix).slice(-12).padStart(12, "1")}`,
      livingWith: "ORANG_TUA",
      notes: `Catatan awal ${suffix}`,
      status: "ACTIVE",
    };

    await page.goto("/admin/students");
    await expect(
      page.getByRole("heading", { name: /^Siswa$/ }),
    ).toBeVisible({ timeout: 15_000 });

    // Open the create dialog.
    await page.getByRole("button", { name: /^Tambah Siswa$/ }).first().click();
    const dialog = page.locator('[data-slot="dialog-content"]').first();
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // ----- Fill Data Anak block -----
    await dialog.getByPlaceholder("Aisyah Putri").fill(payload.name);
    await dialog.getByPlaceholder("Aisyah").fill(payload.nickname);

    // Jenis Kelamin — 1st combobox in the dialog.
    const genderTrigger = dialog.locator('[role="combobox"]').nth(0);
    await genderTrigger.click();
    await page
      .getByRole("option", { name: payload.gender === "L" ? "Laki-laki" : "Perempuan" })
      .click();

    // Tanggal Lahir — native date input. Scope by type since the form has
    // multiple <Input>s and only one is type="date" within the Data Anak block.
    await dialog.locator('input[type="date"]').first().fill(payload.dateOfBirth);

    // Alamat + Catatan — Textareas (placeholder-anchored, not aria-label).
    await dialog
      .getByPlaceholder("Alamat tempat tinggal")
      .fill(payload.address);
    await dialog
      .getByPlaceholder("Alergi, kebutuhan khusus, dll.")
      .fill(payload.notes);

    // ----- Fill Identitas Resmi block -----
    await dialog.getByPlaceholder("Nomor Induk Siswa").fill(payload.nis);
    await dialog
      .getByPlaceholder("Nomor Induk Siswa Nasional")
      .fill(payload.nisn);
    await dialog.getByPlaceholder("Kota kelahiran").fill(payload.birthPlace);
    await dialog
      .getByPlaceholder("Nomor Induk Kependudukan")
      .fill(payload.nik);
    await dialog.getByPlaceholder("Nomor Kartu Keluarga").fill(payload.kkNumber);

    // Tinggal Dengan — 2nd combobox in the dialog (after Gender).
    const livingWithTrigger = dialog.locator('[role="combobox"]').nth(1);
    await livingWithTrigger.click();
    // LIVING_WITH_OPTIONS values: ORANG_TUA / WALI / LAINNYA → labels
    // "Orang Tua" / "Wali" / "Lainnya" (lib/constants/parent-options.ts).
    await page.getByRole("option", { name: "Orang Tua", exact: true }).click();

    // Status — 3rd combobox (already defaults to ACTIVE; re-select to exercise).
    const statusTrigger = dialog.locator('[role="combobox"]').nth(2);
    await statusTrigger.click();
    await page.getByRole("option", { name: "Aktif" }).click();

    // ----- Submit -----
    // The dialog's submit + page header trigger share the same accessible
    // name. Scope the click to the dialog's footer button so we hit Submit,
    // not the header trigger (which would just reopen).
    const submitPromise = page.waitForResponse(
      (res) => res.url().includes("/api/students") && res.request().method() === "POST",
    );
    await dialog.getByRole("button", { name: /^Tambah Siswa$/ }).click();
    const submitRes = await submitPromise;
    expect(submitRes.status()).toBe(201);
    const created = (await submitRes.json()) as { id: string };
    expect(created.id).toBeTruthy();

    // Page navigates to the detail route on success.
    await page.waitForURL(`**/admin/students/${created.id}`, { timeout: 15_000 });

    // ----- Assert every value persisted via API readback -----
    // Over-assert: the rendered DOM tested via getByText is brittle when copy
    // shifts (e.g. "Laki-laki" mapping). The API readback locks the data
    // contract; the DOM assertions below lock the visible-to-admin contract.
    const apiRes = await page.request.get(`/api/students/${created.id}`);
    expect(apiRes.ok()).toBeTruthy();
    const stored = (await apiRes.json()) as Record<string, unknown>;
    expect(stored.name).toBe(payload.name);
    expect(stored.nickname).toBe(payload.nickname);
    expect(stored.gender).toBe(payload.gender);
    expect(stored.dateOfBirth).toContain(payload.dateOfBirth);
    expect(stored.address).toBe(payload.address);
    expect(stored.nis).toBe(payload.nis);
    expect(stored.nisn).toBe(payload.nisn);
    expect(stored.birthPlace).toBe(payload.birthPlace);
    expect(stored.nik).toBe(payload.nik);
    expect(stored.kkNumber).toBe(payload.kkNumber);
    expect(stored.livingWith).toBe(payload.livingWith);
    expect(stored.notes).toBe(payload.notes);
    expect(stored.status).toBe(payload.status);

    // ----- Assert DOM rendering surfaces the values -----
    // Detail page is the same surface an admin sees on reopen. Lock the
    // happy-path: every literal value the admin typed lands somewhere visible.
    await expect(page.getByRole("heading", { name: payload.name })).toBeVisible();
    await expect(page.getByText(payload.nickname).first()).toBeVisible();
    await expect(page.getByText(payload.address)).toBeVisible();
    await expect(page.getByText(payload.notes).first()).toBeVisible();
    await expect(page.getByText(payload.nis).first()).toBeVisible();
    await expect(page.getByText(payload.nisn).first()).toBeVisible();
    await expect(page.getByText(payload.birthPlace).first()).toBeVisible();
    await expect(page.getByText(payload.nik).first()).toBeVisible();
    await expect(page.getByText(payload.kkNumber).first()).toBeVisible();

    // ----- Edit notes via API (UI Edit dialog opens via row action; here we
    // exercise the persistence contract directly to keep the spec fast +
    // immune to dialog-driver flakiness) -----
    const newNotes = `Updated ${suffix}`;
    const editRes = await page.request.put(`/api/students/${created.id}`, {
      data: { notes: newNotes },
    });
    expect(editRes.ok()).toBeTruthy();

    // Re-fetch + assert persistence
    const after = await page.request.get(`/api/students/${created.id}`);
    const afterJson = (await after.json()) as { notes: string };
    expect(afterJson.notes).toBe(newNotes);

    // Reload the detail page → updated notes render in the DOM.
    await page.reload();
    await expect(page.getByText(newNotes).first()).toBeVisible({ timeout: 15_000 });

    // ----- Cleanup: deactivate so marathon runs do not accumulate -----
    await page.request
      .put(`/api/students/${created.id}`, { data: { status: "INACTIVE" } })
      .catch(() => undefined);
  });
});
