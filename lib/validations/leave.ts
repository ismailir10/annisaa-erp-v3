import { z } from "zod";

export const createLeaveRequestSchema = z.object({
  leaveType: z.string().min(1, "Jenis cuti wajib diisi"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal mulai tidak valid (YYYY-MM-DD)"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal selesai tidak valid (YYYY-MM-DD)"),
  reason: z.string().trim().min(1, "Alasan wajib diisi"),
});
