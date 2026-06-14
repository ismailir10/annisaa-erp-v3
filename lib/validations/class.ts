import { z } from "zod";

// Zod schemas for the consolidated /admin/classes surface. A "Class" in this
// API is a single per-year row (Prisma `ClassSection`). The cross-year
// `ClassTrack` is silent plumbing: POST find-or-creates it from
// (tenantId, campusId, programId, name) on the caller's behalf.

export const SLOT_TEMPLATES = ["FULL_DAY", "MORNING_AND_AFTERNOON"] as const;

// Kelompok usia (A = 4-5 yo / B = 5-6 yo). Mirrors Prisma enum `AgeGroup`.
// Promoted 2026-05-20 from the legacy `deriveAgeGroup` name-heuristic to an
// explicit required field — drives walas-weekly + sentra cohort + perkembangan.
export const ageGroupSchema = z.enum(["A", "B"]);

const namePiece = z
  .string()
  .trim()
  .min(1, "Nama kelas wajib diisi")
  .max(120, "Nama kelas terlalu panjang");

const capacityPiece = z
  .number()
  .int("Kapasitas harus bilangan bulat")
  .min(1, "Kapasitas minimal 1")
  .max(200, "Kapasitas maksimal 200");

export const classCreateSchema = z.object({
  campusId: z.string().min(1, "Kampus wajib dipilih"),
  programId: z.string().min(1, "Program wajib dipilih"),
  academicYearId: z.string().min(1, "Tahun ajaran wajib dipilih"),
  name: namePiece,
  capacity: capacityPiece,
  slotTemplate: z.enum(SLOT_TEMPLATES).default("FULL_DAY"),
  ageGroup: ageGroupSchema,
});

export const classUpdateSchema = z.object({
  name: namePiece.optional(),
  capacity: capacityPiece.optional(),
  slotTemplate: z.enum(SLOT_TEMPLATES).optional(),
  ageGroup: ageGroupSchema.optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export const enrollmentAddSchema = z.object({
  studentId: z.string().min(1, "Siswa wajib dipilih"),
});

export const teachingAssignmentAddSchema = z.object({
  employeeId: z.string().min(1, "Guru wajib dipilih"),
  role: z.enum(["HOMEROOM", "ASSISTANT"]).default("HOMEROOM"),
});

export type ClassCreateInput = z.infer<typeof classCreateSchema>;
export type ClassUpdateInput = z.infer<typeof classUpdateSchema>;
export type EnrollmentAddInput = z.infer<typeof enrollmentAddSchema>;
export type TeachingAssignmentAddInput = z.infer<
  typeof teachingAssignmentAddSchema
>;
