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

// Pickup-relation enum — who collected the student at checkout. App-side rule:
// OTHER requires a non-empty pickedUpByName (enforced in sessionAttendanceSchema
// refine + handler). Mirrors StudentAttendance.pickedUpByRelation allowed values.
export const pickedUpByRelationEnum = z.enum([
  "PARENT",
  "GUARDIAN",
  "GRANDPARENT",
  "SIBLING",
  "DRIVER",
  "HOUSEHOLD_HELPER",
  "OTHER",
]);

// Session-based bulk attendance upsert (academic-hierarchy-refactor Task 7).
// Keyed on (studentId, sessionId) — the session id comes from the route param,
// not the body. Cross-field rules: OTHER ⇒ name required; checkOut ≥ checkIn.
export const sessionAttendanceSchema = z.object({
  rows: z
    .array(
      z
        .object({
          studentId: z.string().min(1),
          status: studentAttendanceStatusEnum,
          checkInTime: z.string().datetime().optional().nullable(),
          checkOutTime: z.string().datetime().optional().nullable(),
          pickedUpByRelation: pickedUpByRelationEnum.optional().nullable(),
          pickedUpByName: z.string().trim().max(120).optional().nullable(),
        })
        .refine(
          (r) =>
            r.pickedUpByRelation !== "OTHER" ||
            (!!r.pickedUpByName && r.pickedUpByName.trim().length > 0),
          {
            message:
              "Nama penjemput wajib diisi bila hubungan dipilih Lainnya",
            path: ["pickedUpByName"],
          },
        )
        .refine(
          (r) =>
            !r.checkInTime ||
            !r.checkOutTime ||
            new Date(r.checkOutTime).getTime() >=
              new Date(r.checkInTime).getTime(),
          {
            message: "Waktu pulang tidak boleh sebelum waktu masuk",
            path: ["checkOutTime"],
          },
        ),
    )
    .min(1)
    .max(200)
    .refine(
      (rows) => {
        const ids = rows.map((r) => r.studentId);
        return new Set(ids).size === ids.length;
      },
      {
        message: "Terdapat siswa yang sama lebih dari sekali dalam daftar",
        path: ["rows"],
      },
    ),
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
