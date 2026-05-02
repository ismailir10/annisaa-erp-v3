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

/**
 * Body schema for self-service check-in / check-out.
 *
 * `lat` / `lng` are optional GPS coordinates captured by the teacher portal —
 * a phone GPS may be unavailable (indoor, denied permission), in which case
 * the field is omitted entirely. When present, both must be finite numbers
 * inside the legal earth-coordinate ranges. String types are rejected: the
 * old route silently destructured `body.lat` / `body.lng`, accepting whatever
 * shape the caller sent and forwarding it to `prisma.create`.
 */
export const attendanceCheckInSchema = z
  .object({
    lat: z
      .number()
      .finite()
      .min(-90, "Latitude di luar rentang valid")
      .max(90, "Latitude di luar rentang valid")
      .optional(),
    lng: z
      .number()
      .finite()
      .min(-180, "Longitude di luar rentang valid")
      .max(180, "Longitude di luar rentang valid")
      .optional(),
  })
  // Strip unknown keys silently — clients may send extra debug fields and we
  // don't want to 400 on harmless additions, but we do want to ignore them.
  .strip();

export type AttendanceCheckInInput = z.infer<typeof attendanceCheckInSchema>;
