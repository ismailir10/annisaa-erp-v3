import { z } from "zod";

export const updateStudentAttendanceSchema = z.object({
  status: z.enum(["PRESENT", "ABSENT", "SICK", "PERMISSION"]),
  notes: z.string().max(500).optional().nullable(),
});
