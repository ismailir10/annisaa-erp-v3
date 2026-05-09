// @vitest-environment node
//
// acceptAdmission — ACCEPTED side-effect bundle. Covers the 6 scenarios
// from cycle T6 AC. Email-enqueue isolation case (g) is moved to T7
// when the template wiring + sendEmail call land.
//
// Mocks the prisma client + tx callback so we exercise the orchestration
// without a live DB. Cycle: docs/cycles/2026-05-10-p2-admission-funnel-ui-review.md (T6)

import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdmissionStatus } from "@/lib/generated/prisma/enums";
import type { SessionContext } from "@/lib/auth/session";

vi.mock("@/lib/db", () => ({ prisma: {} }));

import { acceptAdmission } from "../accept";

type AdmissionRow = {
  id: string;
  tenantId: string;
  status: AdmissionStatus;
  addressId: string;
  programId: string;
  applicantFullName: string;
  applicantNickname: string | null;
  applicantNik: string | null;
  applicantBirthDate: Date | null;
  applicantGender: string | null;
  applicantBirthPlace: string | null;
  fatherName: string | null;
  fatherNik: string | null;
  fatherPhone: string | null;
  motherName: string | null;
  motherNik: string | null;
  motherPhone: string | null;
  siblingDetectedFromHouseholdId: string | null;
  acceptedStudentId: string | null;
  decidedAt: Date | null;
  notes: string | null;
  deletedAt: Date | null;
};

type SeedOpts = {
  status?: AdmissionStatus;
  applicantGender?: string | null;
  fatherName?: string | null;
  fatherNik?: string | null;
  motherName?: string | null;
  motherNik?: string | null;
  siblingDetectedFromHouseholdId?: string | null;
  /** Existing Household to seed alongside (for sibling-merge tests). */
  siblingHousehold?: {
    id: string;
    /** Existing Guardians in the sibling Household, keyed by NIK for merge lookup. */
    guardiansByNik: Record<string, string>; // nik → guardianId
  };
};

function makePrismaMock(opts: SeedOpts = {}) {
  const seedAdmission: AdmissionRow = {
    id: "adm_1",
    tenantId: "t_demo",
    status: opts.status ?? AdmissionStatus.OFFER_EXTENDED,
    addressId: "addr_1",
    programId: "prog_paud",
    applicantFullName: "Aisyah Nur Hasan",
    applicantNickname: "Aisyah",
    applicantNik: "1111222233334444",
    applicantBirthDate: new Date("2020-01-15"),
    applicantGender: opts.applicantGender ?? "FEMALE",
    applicantBirthPlace: "Jakarta",
    fatherName: opts.fatherName ?? "Hasan",
    fatherNik: opts.fatherNik ?? "1234567890123456",
    fatherPhone: "081200001234",
    motherName: opts.motherName ?? "Nur Hidayah",
    motherNik: opts.motherNik ?? "6543210987654321",
    motherPhone: "081200005678",
    siblingDetectedFromHouseholdId: opts.siblingDetectedFromHouseholdId ?? null,
    acceptedStudentId: null,
    decidedAt: null,
    notes: null,
    deletedAt: null,
  };

  const admissions: AdmissionRow[] = [seedAdmission];
  const households: Array<{ id: string; tenantId: string; addressId: string | null }> = [];
  const students: Array<Record<string, unknown>> = [];
  const guardians: Array<{ id: string; tenantId: string; nik: string | null; fullName: string }> = [];
  const studentGuardians: Array<Record<string, unknown>> = [];
  const auditRows: Array<Record<string, unknown>> = [];
  const timelineRows: Array<Record<string, unknown>> = [];

  let nextId = 1;
  const mintId = (prefix: string) => `${prefix}_${nextId++}`;

  // Pre-seed sibling Household + its Guardians if requested.
  if (opts.siblingHousehold) {
    households.push({
      id: opts.siblingHousehold.id,
      tenantId: "t_demo",
      addressId: "addr_existing",
    });
    for (const [nik, guardianId] of Object.entries(opts.siblingHousehold.guardiansByNik)) {
      guardians.push({
        id: guardianId,
        tenantId: "t_demo",
        nik,
        fullName: `Existing-${nik.slice(0, 4)}`,
      });
    }
  }

  const admission = {
    findFirst: vi.fn(async (args: { where: { id: string; tenantId: string; deletedAt: null } }) => {
      const r = admissions.find(
        (a) =>
          a.id === args.where.id &&
          a.tenantId === args.where.tenantId &&
          a.deletedAt === null,
      );
      return r ?? null;
    }),
    update: vi.fn(
      async (args: {
        where: { id: string };
        data: { status: AdmissionStatus; decidedAt: Date; acceptedStudentId: string };
      }) => {
        const r = admissions.find((a) => a.id === args.where.id);
        if (!r) throw new Error("not_found");
        r.status = args.data.status;
        r.decidedAt = args.data.decidedAt;
        r.acceptedStudentId = args.data.acceptedStudentId;
        return {
          id: r.id,
          status: r.status,
          decidedAt: r.decidedAt,
          acceptedStudentId: r.acceptedStudentId,
        };
      },
    ),
  };

  const household = {
    findFirst: vi.fn(async (args: { where: { id: string; tenantId: string; deletedAt: null } }) => {
      const r = households.find(
        (h) => h.id === args.where.id && h.tenantId === args.where.tenantId,
      );
      return r ? { id: r.id } : null;
    }),
    create: vi.fn(async (args: { data: { tenantId: string; addressId: string } }) => {
      const id = mintId("h");
      households.push({ id, tenantId: args.data.tenantId, addressId: args.data.addressId });
      return { id };
    }),
  };

  const student = {
    create: vi.fn(async (args: { data: Record<string, unknown> }) => {
      const id = mintId("s");
      students.push({ id, ...args.data });
      return { id };
    }),
  };

  const guardian = {
    findMany: vi.fn(
      async (args: {
        where: {
          tenantId: string;
          nik: string;
          studentGuardians: { some: { student: { householdId: string } } };
        };
      }) => {
        // Approximate the studentGuardians.some.student.householdId join
        // by gating on opts.siblingHousehold.id matching the requested
        // householdId — only seeded Guardians count as "linked" to the
        // sibling Household. Cross-Household NIK collisions correctly
        // surface as no-match.
        const requestedHouseholdId =
          args.where.studentGuardians.some.student.householdId;
        if (
          !opts.siblingHousehold ||
          opts.siblingHousehold.id !== requestedHouseholdId
        ) {
          return [];
        }
        const targetNik = args.where.nik;
        return guardians
          .filter((g) => g.tenantId === args.where.tenantId && g.nik === targetNik)
          .map((g) => ({ id: g.id }));
      },
    ),
    create: vi.fn(
      async (args: {
        data: { tenantId: string; fullName: string; nik: string | null; phone: string | null };
      }) => {
        const id = mintId("g");
        guardians.push({
          id,
          tenantId: args.data.tenantId,
          nik: args.data.nik,
          fullName: args.data.fullName,
        });
        return { id };
      },
    ),
  };

  const studentGuardian = {
    create: vi.fn(async (args: { data: Record<string, unknown> }) => {
      const id = mintId("sg");
      studentGuardians.push({ id, ...args.data });
      return { id };
    }),
  };

  const auditLog = {
    create: vi.fn(async (args: { data: Record<string, unknown> }) => {
      const id = mintId("al");
      auditRows.push({ id, ...args.data });
      return { id };
    }),
  };
  const timelineEvent = {
    create: vi.fn(async (args: { data: Record<string, unknown> }) => {
      const id = mintId("te");
      timelineRows.push({ id, ...args.data });
      return { id };
    }),
  };

  const tx = {
    admission,
    household,
    student,
    guardian,
    studentGuardian,
    auditLog,
    timelineEvent,
  };

  const prisma = {
    ...tx,
    $transaction: vi.fn(async (fn: (txClient: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  return {
    prisma,
    tx,
    admissions,
    households,
    students,
    guardians,
    studentGuardians,
    auditRows,
    timelineRows,
  };
}

const ADMIN_SESSION: SessionContext = {
  tenantId: "t_demo",
  userId: "u_admin",
  supabaseUserId: "sup_admin",
  role: "admin",
  currentTermId: "term_1",
};
const PARENT_SESSION: SessionContext = {
  ...ADMIN_SESSION,
  userId: "u_parent",
  role: "parent",
};

const BASE_INPUT = {
  admissionId: "adm_1",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("acceptAdmission", () => {
  it("new-Household path: creates 1 Household + 1 Student + 2 Guardians + 2 SG links", async () => {
    const m = makePrismaMock();
    const result = await acceptAdmission(m.prisma as never, ADMIN_SESSION, BASE_INPUT);

    expect(m.households).toHaveLength(1);
    expect(m.students).toHaveLength(1);
    expect(m.guardians).toHaveLength(2);
    expect(m.studentGuardians).toHaveLength(2);

    expect(result.previousStatus).toBe(AdmissionStatus.OFFER_EXTENDED);
    expect(result.status).toBe(AdmissionStatus.ACCEPTED);
    expect(result.householdId).toBe(m.households[0].id);
    expect(result.studentId).toBe((m.students[0] as { id: string }).id);
    expect(result.guardianIds).toHaveLength(2);

    // Both StudentGuardian rows are PRIMARY (per #192 partial-unique permits
    // FATHER + MOTHER coexisting at PRIMARY).
    const sgPrimaryFlags = m.studentGuardians.map((sg) => sg.isPrimary);
    expect(sgPrimaryFlags).toEqual([true, true]);
    const sgRelationships = m.studentGuardians.map((sg) => sg.relationship).sort();
    expect(sgRelationships).toEqual(["FATHER", "MOTHER"]);

    // Admission updated with acceptedStudentId backlink.
    expect(m.admissions[0].status).toBe(AdmissionStatus.ACCEPTED);
    expect(m.admissions[0].acceptedStudentId).toBe(result.studentId);
  });

  it("sibling-merge path with new Guardians: reuses Household + creates 2 Guardians (no NIK matches)", async () => {
    const m = makePrismaMock({
      siblingDetectedFromHouseholdId: "h_existing",
      siblingHousehold: {
        id: "h_existing",
        guardiansByNik: {}, // empty — no NIK matches existing Guardians
      },
    });
    const result = await acceptAdmission(m.prisma as never, ADMIN_SESSION, BASE_INPUT);

    // Household: ONLY the seeded sibling Household — no new create.
    expect(m.households).toHaveLength(1);
    expect(m.households[0].id).toBe("h_existing");
    expect(m.tx.household.create).not.toHaveBeenCalled();

    // Guardian: 2 created (no merges).
    expect(m.tx.guardian.create).toHaveBeenCalledTimes(2);
    expect(m.studentGuardians).toHaveLength(2);
    expect(result.householdId).toBe("h_existing");
  });

  it("sibling-merge path reusing existing Guardian: creates 1 new + reuses 1 existing", async () => {
    const m = makePrismaMock({
      siblingDetectedFromHouseholdId: "h_existing",
      siblingHousehold: {
        id: "h_existing",
        // Mother NIK matches an existing Guardian — should reuse.
        guardiansByNik: { "6543210987654321": "g_existing_mother" },
      },
    });
    const result = await acceptAdmission(m.prisma as never, ADMIN_SESSION, BASE_INPUT);

    expect(m.households).toHaveLength(1); // sibling Household reused
    // 1 new Guardian created (father — no NIK match) + 1 existing reused (mother).
    expect(m.tx.guardian.create).toHaveBeenCalledTimes(1);
    expect(m.studentGuardians).toHaveLength(2);

    // The mother SG link points at the EXISTING Guardian id, not a new one.
    const motherSg = m.studentGuardians.find((sg) => sg.relationship === "MOTHER");
    expect(motherSg?.guardianId).toBe("g_existing_mother");
    expect(result.guardianIds).toContain("g_existing_mother");
  });

  it("transactional rollback on Guardian write failure (forced P2002)", async () => {
    const m = makePrismaMock();
    // Force Guardian create to throw — simulates P2002 unique constraint race.
    m.tx.guardian.create.mockImplementationOnce(async () => {
      throw new Error("Unique constraint failed");
    });

    await expect(
      acceptAdmission(m.prisma as never, ADMIN_SESSION, BASE_INPUT),
    ).rejects.toThrow(/Unique constraint failed/);

    // Admission status was NOT advanced — the throw rolled back the tx.
    // The mock harness doesn't model true tx rollback (each mock mutation is
    // committed locally) but the audit + timeline assertions confirm the
    // post-throw writes never executed, which is what tx rollback enforces.
    expect(m.auditRows).toHaveLength(0);
    expect(m.timelineRows).toHaveLength(0);
    expect(m.tx.admission.update).not.toHaveBeenCalled();
  });

  it("idempotent vs double-click: re-running on already-ACCEPTED row throws INVALID_TRANSITION", async () => {
    const m = makePrismaMock({ status: AdmissionStatus.ACCEPTED });
    await expect(
      acceptAdmission(m.prisma as never, ADMIN_SESSION, BASE_INPUT),
    ).rejects.toThrow(/INVALID_TRANSITION: ACCEPTED → ACCEPTED/);

    // No side-effect rows created.
    expect(m.households).toHaveLength(0);
    expect(m.students).toHaveLength(0);
    expect(m.guardians).toHaveLength(0);
    expect(m.studentGuardians).toHaveLength(0);
    expect(m.auditRows).toHaveLength(0);
    expect(m.timelineRows).toHaveLength(0);
  });

  it("NIK collision: throws NIK_COLLISION_IN_HOUSEHOLD when 2+ Guardians share NIK in resolved Household", async () => {
    const m = makePrismaMock({
      siblingDetectedFromHouseholdId: "h_existing",
      siblingHousehold: {
        id: "h_existing",
        // Two seeded Guardians both have father's NIK — invariant violation.
        guardiansByNik: {},
      },
    });
    // Manually seed two duplicate-NIK Guardians (data-quality defect simulation).
    m.guardians.push(
      { id: "g_dup_1", tenantId: "t_demo", nik: "1234567890123456", fullName: "Hasan A" },
      { id: "g_dup_2", tenantId: "t_demo", nik: "1234567890123456", fullName: "Hasan B" },
    );

    await expect(
      acceptAdmission(m.prisma as never, ADMIN_SESSION, BASE_INPUT),
    ).rejects.toThrow(/NIK_COLLISION_IN_HOUSEHOLD/);

    // Mock harness can't model true tx rollback — the mock pushes Student
    // mutations to local arrays even on throw. What tx rollback enforces is
    // that NO writes after the throw point execute: SG creation, admission
    // update, audit row, timeline event. All of those are post-NIK-merge.
    expect(m.studentGuardians).toHaveLength(0);
    expect(m.auditRows).toHaveLength(0);
    expect(m.timelineRows).toHaveLength(0);
    expect(m.tx.admission.update).not.toHaveBeenCalled();
  });

  it("scope rejection: parent role throws FORBIDDEN before any DB roundtrip", async () => {
    const m = makePrismaMock();
    await expect(
      acceptAdmission(m.prisma as never, PARENT_SESSION, BASE_INPUT),
    ).rejects.toThrow(/FORBIDDEN/);

    expect(m.prisma.$transaction).not.toHaveBeenCalled();
    expect(m.tx.admission.findFirst).not.toHaveBeenCalled();
  });
});
