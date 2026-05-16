import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const {
  admissionFindUnique,
  studentCreate,
  parentUpsert,
  parentCreate,
  studentGuardianCreate,
  admissionUpdate,
} = vi.hoisted(() => ({
  admissionFindUnique: vi.fn(),
  studentCreate: vi.fn(),
  parentUpsert: vi.fn(),
  parentCreate: vi.fn(),
  studentGuardianCreate: vi.fn(),
  admissionUpdate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    admission: { findUnique: admissionFindUnique },
    $transaction: vi.fn((fn: Function) =>
      fn({
        student: { create: studentCreate },
        parent: { upsert: parentUpsert, create: parentCreate },
        studentGuardian: { create: studentGuardianCreate },
        admission: { update: admissionUpdate },
      })
    ),
  },
}));

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn().mockResolvedValue({
    id: "u-1",
    tenantId: "t-1",
    role: "SUPER_ADMIN",
    email: "admin@test.com",
    name: "Admin",
    permissions: [],
    customRoleCode: null,
    employeeId: null,
    parentId: null,
  }),
  isAdminRole: vi.fn().mockReturnValue(true),
}));

import { POST } from "../route";

function makeAdmission(overrides: Record<string, unknown> = {}) {
  return {
    id: "adm-1",
    tenantId: "t-1",
    childName: "Aisyah",
    childGender: "P",
    dateOfBirth: "2021-03-15",
    parentName: "Ibu Fatimah",
    parentPhone: "081234567890",
    parentEmail: "fatimah@test.com",
    parentWhatsapp: "081234567890",
    parentEducation: "S1",
    parentOccupation: "Guru",
    parentIncome: "Rp 3-5 Juta",
    notes: "Anak aktif, suka menggambar",
    parentRelationship: null,
    status: "ADMITTED",
    studentId: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  studentCreate.mockResolvedValue({ id: "stu-1" });
  parentUpsert.mockResolvedValue({ id: "par-1" });
  parentCreate.mockResolvedValue({ id: "par-1" });
  studentGuardianCreate.mockResolvedValue({ id: "sg-1" });
  admissionUpdate.mockResolvedValue({});
});

describe("POST /api/admissions/[id]/convert", () => {
  it("copies parentEducation, parentOccupation, parentIncome to Parent", async () => {
    admissionFindUnique.mockResolvedValue(makeAdmission());

    const req = new NextRequest("http://localhost/api/admissions/adm-1/convert", { method: "POST" });
    await POST(req, { params: Promise.resolve({ id: "adm-1" }) });

    expect(parentUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          education: "S1",
          occupation: "Guru",
          incomeRange: "Rp 3-5 Juta",
        }),
        update: expect.objectContaining({
          education: "S1",
          occupation: "Guru",
          incomeRange: "Rp 3-5 Juta",
        }),
      })
    );
  });

  it("copies admission.notes to Student.notes", async () => {
    admissionFindUnique.mockResolvedValue(makeAdmission());

    const req = new NextRequest("http://localhost/api/admissions/adm-1/convert", { method: "POST" });
    await POST(req, { params: Promise.resolve({ id: "adm-1" }) });

    expect(studentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          notes: "Anak aktif, suka menggambar",
        }),
      })
    );
  });

  it("transfers fields when parent has no email (create path)", async () => {
    admissionFindUnique.mockResolvedValue(makeAdmission({ parentEmail: null }));

    const req = new NextRequest("http://localhost/api/admissions/adm-1/convert", { method: "POST" });
    await POST(req, { params: Promise.resolve({ id: "adm-1" }) });

    expect(parentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          education: "S1",
          occupation: "Guru",
          incomeRange: "Rp 3-5 Juta",
        }),
      })
    );
  });

  it("uses parentRelationship for StudentGuardian, defaults to IBU", async () => {
    admissionFindUnique.mockResolvedValue(makeAdmission({ parentRelationship: "AYAH" }));

    const req = new NextRequest("http://localhost/api/admissions/adm-1/convert", { method: "POST" });
    await POST(req, { params: Promise.resolve({ id: "adm-1" }) });

    expect(studentGuardianCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ relationship: "AYAH" }),
      })
    );
  });

  it("defaults relationship to IBU when parentRelationship is null", async () => {
    admissionFindUnique.mockResolvedValue(makeAdmission({ parentRelationship: null }));

    const req = new NextRequest("http://localhost/api/admissions/adm-1/convert", { method: "POST" });
    await POST(req, { params: Promise.resolve({ id: "adm-1" }) });

    expect(studentGuardianCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ relationship: "IBU" }),
      })
    );
  });
});
