import { z } from "zod";
import { optionalTrimmed, optionalEnum } from "./zod-helpers";

/**
 * Admin-side create/update schemas for Admission rows.
 *
 * Every optional string field uses `optionalTrimmed` so an empty-string
 * payload from an unfilled HTML input (e.g. `parentEmail: ""`) is coerced
 * to `undefined` before the inner validator runs. Without this, `.email()`
 * on `""` returns "Email tidak valid" and admin edits 400 — see
 * `docs/cycles/2026-05-11-admin-admissions-empty-string-fix.md`.
 *
 * `childAge` is NOT exposed here — it is auto-derived from `dateOfBirth`
 * via `lib/admission/age.ts:formatAgeFromDob` at display time. The schema
 * column stays in `prisma/schema.prisma` for backward compatibility with
 * legacy rows, but new writes never set it.
 */
export const createAdmissionSchema = z.object({
  childName: z.string().min(1, "Nama anak wajib diisi"),
  // optionalEnum: form `<Select>` whose value is "" must coerce to undefined
  // before z.enum() runs; .optional() alone only allows undefined, not "".
  childGender: optionalEnum(z.enum(["L", "P"])),
  dateOfBirth: optionalTrimmed(z.string()),
  parentName: z.string().min(1, "Nama orang tua wajib diisi"),
  parentPhone: optionalTrimmed(z.string()),
  parentEmail: optionalTrimmed(z.string().email("Email tidak valid")),
  parentWhatsapp: optionalTrimmed(z.string()),
  parentEducation: optionalTrimmed(z.string()),
  parentOccupation: optionalTrimmed(z.string()),
  parentIncome: optionalTrimmed(z.string()),
  programId: optionalTrimmed(z.string()),
  source: z.enum(["WHATSAPP", "WALK_IN", "WEBSITE", "REFERRAL", "OTHER"]).default("WALK_IN"),
  notes: optionalTrimmed(z.string()),
  followUpDate: optionalTrimmed(z.string()),
});

export const updateAdmissionSchema = createAdmissionSchema.partial().extend({
  status: z.enum(["INQUIRY", "VISIT_SCHEDULED", "VISITED", "ADMITTED", "REGISTERED", "CANCELLED"]).optional(),
});
