import { z } from "zod";

export const studentAttendanceStatusEnum = z.enum([
  "PRESENT",
  "ABSENT",
  "SICK",
  "PERMISSION",
]);

export const updateStudentAttendanceSchema = z.object({
  status: studentAttendanceStatusEnum,
  notes: z.string().max(500).optional().nullable(),
});

export const markAttendanceSchema = z.object({
  classSectionId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  records: z
    .array(
      z.object({
        studentId: z.string().min(1),
        status: studentAttendanceStatusEnum,
        checkInTime: z.string().datetime().optional().nullable(),
        checkOutTime: z.string().datetime().optional().nullable(),
        notes: z.string().max(500).optional().nullable(),
      })
    )
    .min(1)
    .max(200),
});
