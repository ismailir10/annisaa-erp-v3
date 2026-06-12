import { test, expect } from "@playwright/test";

// E2E coverage for the consolidated /admin/classes surface (cycle:
// 2026-05-19-kelas-page). Demo-mode session cookie auth matches the
// pattern in admin.spec.ts.

const ADMIN_USER_ID = "u_super_admin";

test.describe("Admin /admin/classes", () => {
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

  test("list page renders with year switcher + filters + DataTable", async ({
    page,
  }) => {
    await page.goto("/admin/classes");
    await page.waitForURL("**/admin/classes");

    await expect(page.getByRole("heading", { name: "Kelas" })).toBeVisible({
      timeout: 10_000,
    });
    // At least one SelectTrigger renders (year switcher + filters)
    await expect(page.getByRole("combobox").first()).toBeVisible();
    // Either rows or empty state — both acceptable for a fresh seed
    const tableVisible = page
      .locator("table")
      .or(page.getByText("Belum ada kelas"));
    await expect(tableVisible.first()).toBeVisible({ timeout: 10_000 });
  });

  test("create class find-or-creates ClassTrack on the unique key", async ({
    page,
  }) => {
    // Resolve a campus + program + active year via API to drive the POST.
    const [campusRes, programRes, yearRes] = await Promise.all([
      page.request.get("/api/config/campuses?status=ACTIVE"),
      page.request.get("/api/programs"),
      page.request.get("/api/admin/academic-years"),
    ]);
    if (!campusRes.ok() || !programRes.ok() || !yearRes.ok()) {
      test.skip(true, "Reference data endpoints unavailable in demo seed");
      return;
    }
    const campuses = await campusRes.json();
    const programs = await programRes.json();
    const years = await yearRes.json();
    const campusList = Array.isArray(campuses) ? campuses : campuses.data ?? [];
    const programList = Array.isArray(programs) ? programs : programs.data ?? [];
    const yearList = Array.isArray(years) ? years : years.data ?? [];
    const activeYear =
      yearList.find((y: { status: string }) => y.status === "ACTIVE") ??
      yearList[0];
    if (!campusList[0] || !programList[0] || !activeYear) {
      test.skip(true, "Demo seed missing required reference rows");
      return;
    }

    const suffix = String(Date.now()).slice(-6);
    const className = `E2E ${suffix}`;
    const res = await page.request.post("/api/admin/classes", {
      data: {
        campusId: campusList[0].id,
        programId: programList[0].id,
        academicYearId: activeYear.id,
        name: className,
        capacity: 5,
        slotTemplate: "FULL_DAY",
      },
    });
    expect(res.ok()).toBeTruthy();
    const created = await res.json();
    expect(created.name).toBe(className);
    // ClassTrack auto-created — its id is non-empty and tied to the new section
    expect(created.classTrackId).toBeTruthy();
    expect(created.classTrack?.name).toBe(className);

    // Cleanup so subsequent runs stay idempotent
    await page.request.delete(`/api/admin/classes/${created.id}`).catch(() => {});
  });

  test("HOMEROOM uniqueness returns 409 HOMEROOM_EXISTS", async ({ page }) => {
    // Pick any class + any two employees in the tenant.
    const classes = await page.request
      .get("/api/admin/classes?pageSize=5")
      .then((r) => (r.ok() ? r.json() : null));
    const employees = await page.request
      .get("/api/employees?status=ACTIVE&pageSize=5")
      .then((r) => (r.ok() ? r.json() : null));
    const classList = classes?.data ?? [];
    const empList = employees?.data ?? employees ?? [];
    if (classList.length === 0 || empList.length < 2) {
      test.skip(true, "Demo seed has insufficient class/employee rows");
      return;
    }
    const klass = classList[0];

    // Clear any pre-existing HOMEROOM on this class to make the first POST land.
    await page.request
      .get(`/api/admin/classes/${klass.id}`)
      .then((r) => (r.ok() ? r.json() : null))
      .then(async (detail) => {
        const hr = detail?.teachingAssignments?.find(
          (a: { role: string }) => a.role === "HOMEROOM",
        );
        if (hr) {
          await page.request.delete(
            `/api/admin/classes/${klass.id}/teaching-assignments?employeeId=${hr.employee.id}`,
          );
        }
      });

    const first = await page.request.post(
      `/api/admin/classes/${klass.id}/teaching-assignments`,
      { data: { employeeId: empList[0].id, role: "HOMEROOM" } },
    );
    expect(first.ok()).toBeTruthy();

    const second = await page.request.post(
      `/api/admin/classes/${klass.id}/teaching-assignments`,
      { data: { employeeId: empList[1].id, role: "HOMEROOM" } },
    );
    expect(second.status()).toBe(409);
    const body = await second.json();
    expect(body.code).toBe("HOMEROOM_EXISTS");
    expect(body.existingEmployeeId).toBe(empList[0].id);

    // Cleanup
    await page.request.delete(
      `/api/admin/classes/${klass.id}/teaching-assignments?employeeId=${empList[0].id}`,
    );
  });

  test("enrollment add then remove round-trip", async ({ page }) => {
    const classes = await page.request
      .get("/api/admin/classes?pageSize=5")
      .then((r) => (r.ok() ? r.json() : null));
    const klass = classes?.data?.[0];
    if (!klass) {
      test.skip(true, "Demo seed has no class to roster");
      return;
    }

    // Find a student not currently enrolled in this class's year.
    const students = await page.request
      .get("/api/students?status=ACTIVE&pageSize=100")
      .then((r) => (r.ok() ? r.json() : null));
    const studentList = students?.data ?? students ?? [];
    if (studentList.length === 0) {
      test.skip(true, "Demo seed has no students");
      return;
    }

    // Try each student until one accepts the enroll (most have an existing
    // ACTIVE enrollment in the seeded year). Stop on first 201.
    let enrolledStudentId: string | null = null;
    let enrollmentId: string | null = null;
    for (const s of studentList.slice(0, 20)) {
      const r = await page.request.post(
        `/api/admin/classes/${klass.id}/enrollments`,
        { data: { studentId: s.id } },
      );
      if (r.status() === 201) {
        const j = await r.json();
        enrolledStudentId = s.id;
        enrollmentId = j.id;
        break;
      }
    }
    if (!enrolledStudentId) {
      test.skip(true, "All sample students already enrolled this year");
      return;
    }
    expect(enrollmentId).toBeTruthy();

    // Cleanup — remove
    const del = await page.request.delete(
      `/api/admin/classes/${klass.id}/enrollments?studentId=${enrolledStudentId}`,
    );
    expect(del.ok()).toBeTruthy();
  });

  test("detail page renders with roster, teachers, calendar", async ({
    page,
  }) => {
    const classes = await page.request
      .get("/api/admin/classes?pageSize=1")
      .then((r) => (r.ok() ? r.json() : null));
    const klass = classes?.data?.[0];
    if (!klass) {
      test.skip(true, "Demo seed has no class to view");
      return;
    }
    await page.goto(`/admin/classes/${klass.id}`);
    await page.waitForURL(`**/admin/classes/${klass.id}`);

    // Header carries the class name + year badge
    await expect(page.locator(`text=${klass.name}`).first()).toBeVisible({
      timeout: 10_000,
    });
    // Section headings render
    await expect(page.getByText(/Ringkasan|Roster|Kehadiran/).first()).toBeVisible();
    await expect(
      page.getByText(/Siswa|Daftar Siswa/).first(),
    ).toBeVisible();
    await expect(page.getByText(/Guru Pengajar/).first()).toBeVisible();
  });

  test("retired URLs return 404", async ({ page }) => {
    const tracks = await page.request.get("/admin/class-tracks");
    expect(tracks.status()).toBe(404);
    const teachers = await page.request.get("/admin/teaching-assignments");
    expect(teachers.status()).toBe(404);
    const sections = await page.request.get("/admin/class-sections/anything");
    expect(sections.status()).toBe(404);
    // API trees deleted too
    const apiTracks = await page.request.get("/api/admin/class-tracks");
    expect(apiTracks.status()).toBe(404);
    const apiTeachers = await page.request.get("/api/teaching-assignments");
    expect(apiTeachers.status()).toBe(404);
  });

  test("nav sidebar shows Akademik group with Tahun Ajaran + Kelas only", async ({
    page,
  }) => {
    await page.goto("/admin");
    await page.waitForURL("**/admin");
    // Akademik group label
    await expect(page.locator("text=Akademik").first()).toBeVisible({
      timeout: 10_000,
    });
    // Kelas item present
    await expect(page.locator("text=Kelas").first()).toBeVisible();
    // Old labels gone
    await expect(page.locator("text=Identitas Kelas")).toHaveCount(0);
    await expect(page.locator("text=Guru Pengajar")).toHaveCount(0);
  });

  test("Naik Kelas Massal dialog opens with year/class selectors and roster placeholder", async ({
    page,
  }) => {
    await page.goto("/admin/classes");
    await page.waitForURL("**/admin/classes");
    const trigger = page.getByRole("button", { name: "Naik Kelas Massal" });
    await expect(trigger).toBeVisible({ timeout: 10_000 });
    await trigger.click();

    await expect(
      page.getByRole("heading", { name: "Naik Kelas Massal" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Tahun Ajaran Asal")).toBeVisible();
    await expect(page.getByText("Kelas Tujuan")).toBeVisible();
    // No source class chosen yet → placeholder copy, submit disabled
    await expect(
      page.getByText("Pilih kelas asal untuk melihat daftar siswa."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Naik Kelas \(0 siswa\)/ }),
    ).toBeDisabled();
  });

  test("promotions API rejects a missing source class", async ({ page }) => {
    const res = await page.request.get("/api/promotions");
    expect(res.status()).toBe(400);
    const j = await res.json();
    expect(j.error).toContain("sourceClassSectionId");
  });
});
