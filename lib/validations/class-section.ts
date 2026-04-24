import { z } from "zod";

export const createClassSectionSchema = z.object({
  programId: z.string().min(1, "Program wajib dipilih"),
  campusId: z.string().min(1, "Kampus wajib dipilih"),
  name: z.string().min(1, "Nama kelas wajib diisi").max(80),
  capacity: z.number().int().min(1, "Kapasitas minimal 1").max(500),
  // academicYearId is a NOT NULL FK in the ClassSection schema — every
  // class section belongs to exactly one year. Required at the API too.
  academicYearId: z.string().min(1, "Tahun ajaran wajib dipilih"),
});

export const updateClassSectionSchema = z.object({
  name: z.string().min(1, "Nama kelas wajib diisi").max(80).optional(),
  capacity: z.number().int().min(1, "Kapasitas minimal 1").max(500).optional(),
  campusId: z.string().min(1).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});
