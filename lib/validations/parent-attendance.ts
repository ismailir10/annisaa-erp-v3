import { z } from "zod";

/**
 * Query schema for GET /api/parent/children/[id]/attendance.
 *
 * Status values mirror the live `StudentAttendance.status` strings used
 * across the codebase: PRESENT | ABSENT | SICK | PERMISSION (see
 * prisma/schema.prisma:651 and lib/validations/student-attendance.ts).
 * No "LATE" or "PERMIT" — those don't exist in the model.
 */
export const parentAttendanceQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["PRESENT", "ABSENT", "SICK", "PERMISSION"]).optional(),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  sortField: z.enum(["date", "status"]).default("date"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type ParentAttendanceQuery = z.infer<typeof parentAttendanceQuerySchema>;

export const ATTENDANCE_STATUS_VALUES = [
  "PRESENT",
  "ABSENT",
  "SICK",
  "PERMISSION",
] as const;

export type AttendanceStatusValue = (typeof ATTENDANCE_STATUS_VALUES)[number];
