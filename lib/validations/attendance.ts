import { z } from "zod";

// AttendanceRecord.date is stored as text (YYYY-MM-DD) per prisma schema.
// Validate the shape AND that the value is a real calendar date — `2024-02-31`
// would pass a regex check but is not a real day. Two-step validation: shape
// via regex, then round-trip through Date and confirm the parsed parts match.
const isoDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD")
  .refine(
    (s) => {
      const d = new Date(`${s}T00:00:00Z`);
      if (Number.isNaN(d.getTime())) return false;
      // Round-trip rejects non-existent dates like 2024-02-31 (rolls to 2024-03-02)
      return d.toISOString().slice(0, 10) === s;
    },
    { message: "Tanggal tidak valid" }
  );

export const ATTENDANCE_STATUSES = [
  "PRESENT",
  "LATE",
  "PRESENT_NO_CHECKOUT",
  "HALF_DAY",
  "ABSENT",
  "LEAVE",
  "SICK",
  "PERMISSION",
] as const;

export const attendanceOverrideSchema = z
  .object({
    date: isoDateString,
    status: z.enum(ATTENDANCE_STATUSES),
    reason: z
      .string()
      .trim()
      .min(1, "Alasan wajib diisi")
      .max(500, "Alasan maksimal 500 karakter"),
  })
  .refine(
    (v) => {
      // Reject far-future PRESENT/LATE/HALF_DAY/ABSENT — those describe
      // observed work-day state and cannot be predicted. LEAVE/SICK/PERMISSION
      // are routinely pre-recorded for upcoming days (annual leave planning,
      // school calendar) and bypass the cap.
      if (v.status === "LEAVE" || v.status === "SICK" || v.status === "PERMISSION") {
        return true;
      }
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const target = new Date(`${v.date}T00:00:00Z`);
      const diffDays = (target.getTime() - today.getTime()) / 86_400_000;
      return diffDays <= 30;
    },
    {
      message:
        "Tanggal tidak boleh lebih dari 30 hari ke depan untuk status kehadiran (gunakan LEAVE/SICK/PERMISSION untuk pra-pencatatan)",
      path: ["date"],
    }
  );

export type AttendanceOverrideInput = z.infer<typeof attendanceOverrideSchema>;
