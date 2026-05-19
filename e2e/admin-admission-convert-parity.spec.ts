import { test, expect, type Page } from "@playwright/test";

/**
 * T12 — kesiswaan CRUD parity.
 *
 * Seeds an Admission with every transferable field populated, advances it
 * through the state-machine to ADMITTED, calls POST /api/admissions/[id]/
 * convert, and asserts every populated field landed on the resulting
 * Student / Parent / StudentGuardian rows per T11's field-parity audit.
 *
 * Expected destinations (from convert/route.ts comment block):
 *   childName            → Student.name
 *   childGender          → Student.gender
 *   dateOfBirth          → Student.dateOfBirth
 *   notes                → Student.notes
 *   campusPreference     → Student.metadata.campusPreference (JSON string)
 *   parentName/Phone/Email/Whatsapp/Education/Occupation/Income
 *                        → Parent.{name,phone,email,whatsapp,education,
 *                                  occupation,incomeRange}
 *   parentRelationship   → StudentGuardian.relationship
 *
 * Intentionally dropped (cycle assumption — kept on Admission for audit):
 *   programId / source / followUpDate / detectedParentId / childAge
 *
 * Auth: demo cookie school-erp-session=u_super_admin.
 * Isolation: every test creates a fresh admission keyed on Date.now() and uses
 * a unique email so the Parent upsert lands on the create path (no merge).
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

async function advanceAdmission(page: Page, admissionId: string, status: string) {
  const res = await page.request.put(`/api/admissions/${admissionId}`, {
    data: { status },
  });
  expect(res.ok()).toBeTruthy();
}

test.describe("Admin admission convert — field parity", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("seed admission with full field set → convert → Student + Parent + StudentGuardian populated", async ({
    page,
  }) => {
    const suffix = Date.now();
    const payload = {
      childName: `E2E Convert ${suffix}`,
      dateOfBirth: "2019-06-21",
      childGender: "L",
      parentName: `E2E Bu Convert ${suffix}`,
      parentPhone: `0815111${String(suffix).slice(-4)}`,
      parentEmail: `e2e-convert-${suffix}@example.test`,
      parentWhatsapp: `0815222${String(suffix).slice(-4)}`,
      parentEducation: "S1",
      parentOccupation: "Karyawan Swasta",
      parentIncome: "5-10jt",
      parentRelationship: "IBU",
      notes: `Catatan pendaftaran ${suffix}`,
      source: "WALK_IN",
    };

    // ---------- Resolve a campus for campusPreference -----------------
    // /api/config/campuses returns the active campuses; tag the first one.
    const campusesRes = await page.request.get("/api/config/campuses");
    expect(campusesRes.ok()).toBeTruthy();
    const campuses = (await campusesRes.json()) as Array<{ id: string; name: string }>;
    if (!Array.isArray(campuses) || campuses.length === 0) {
      test.skip(true, "No active campuses available — cannot exercise campusPreference parity");
      return;
    }
    const campusId = campuses[0].id;

    // ---------- Seed Admission with every field ----------------------
    const createRes = await page.request.post("/api/admissions", {
      data: { ...payload, campusPreference: campusId },
    });
    expect(createRes.status()).toBe(201);
    const admission = (await createRes.json()) as { id: string; status: string };
    expect(admission.status).toBe("INQUIRY");

    // ---------- Advance through the state machine to ADMITTED --------
    // VALID_TRANSITIONS (app/api/admissions/[id]/route.ts) enforces:
    //   INQUIRY → VISIT_SCHEDULED → VISITED → ADMITTED
    await advanceAdmission(page, admission.id, "VISIT_SCHEDULED");
    await advanceAdmission(page, admission.id, "VISITED");
    await advanceAdmission(page, admission.id, "ADMITTED");

    // ---------- Convert ----------------------------------------------
    // Admission has no detectedParentId (fresh email never seen before),
    // so the convert path takes the no-confirm direct route. mergeWithDetected
    // defaults true; absent body falls through to true.
    const convertRes = await page.request.post(
      `/api/admissions/${admission.id}/convert`,
      { data: {} },
    );
    expect(convertRes.ok()).toBeTruthy();
    const converted = (await convertRes.json()) as { student: { id: string } };
    const studentId = converted.student.id;
    expect(studentId).toBeTruthy();

    // ---------- Assert Student parity --------------------------------
    const studentRes = await page.request.get(`/api/students/${studentId}`);
    expect(studentRes.ok()).toBeTruthy();
    const stored = (await studentRes.json()) as {
      name: string;
      gender: string | null;
      dateOfBirth: string | null;
      notes: string | null;
      metadata: string | null;
      guardians: Array<{
        id: string;
        relationship: string;
        isPrimary: boolean;
        parent: {
          id: string;
          name: string;
          phone: string | null;
          email: string | null;
          whatsapp: string | null;
          education: string | null;
          occupation: string | null;
          incomeRange: string | null;
        };
      }>;
    };

    expect(stored.name).toBe(payload.childName);
    expect(stored.gender).toBe(payload.childGender);
    expect(stored.dateOfBirth).toContain(payload.dateOfBirth);
    expect(stored.notes).toBe(payload.notes);

    // campusPreference stashed on Student.metadata as JSON per T11 / assumption #3.
    expect(stored.metadata).toBeTruthy();
    const metadata = JSON.parse(stored.metadata!) as { campusPreference: string };
    expect(metadata.campusPreference).toBe(campusId);

    // ---------- Assert StudentGuardian + Parent parity ---------------
    expect(stored.guardians.length).toBeGreaterThanOrEqual(1);
    const sg = stored.guardians[0];
    expect(sg.relationship).toBe(payload.parentRelationship);
    expect(sg.isPrimary).toBe(true);

    const parent = sg.parent;
    expect(parent.name).toBe(payload.parentName);
    expect(parent.phone).toBe(payload.parentPhone);
    expect(parent.email).toBe(payload.parentEmail);
    expect(parent.whatsapp).toBe(payload.parentWhatsapp);
    expect(parent.education).toBe(payload.parentEducation);
    expect(parent.occupation).toBe(payload.parentOccupation);
    expect(parent.incomeRange).toBe(payload.parentIncome);

    // ---------- Cleanup ----------------------------------------------
    await page.request
      .put(`/api/students/${studentId}`, { data: { status: "INACTIVE" } })
      .catch(() => undefined);
  });
});
