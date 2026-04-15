import { z } from "zod";

export const createEmployeeSchema = z.object({
  nama: z.string().min(1, "Nama wajib diisi"),
  formalName: z.string().optional().nullable(),
  email: z.string().email("Email tidak valid"),
  noHp: z.string().optional().nullable(),
  jabatan: z.string().min(1, "Jabatan wajib diisi"),
  campusId: z.string().min(1, "Kampus wajib dipilih"),
  hireDate: z.string().min(1, "Tanggal masuk wajib diisi"),
  bankName: z.string().optional().nullable(),
  bankAccountNo: z.string().optional().nullable(),
  bpjsEnrolled: z.boolean().default(false),
});

export const updateEmployeeSchema = createEmployeeSchema.partial().extend({
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});
