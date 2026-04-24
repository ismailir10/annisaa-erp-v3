import { z } from "zod";

export const createLeaveRequestSchema = z.object({
  leaveType: z.enum(["ANNUAL", "SICK", "PERMISSION", "OTHER"], {
    message: "Jenis cuti tidak valid",
  }),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal mulai tidak valid (YYYY-MM-DD)"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal selesai tidak valid (YYYY-MM-DD)"),
  reason: z.string().trim().min(1, "Alasan wajib diisi"),
});
