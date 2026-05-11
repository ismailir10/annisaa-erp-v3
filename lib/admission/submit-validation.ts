import { z } from "zod";
import { optionalTrimmed } from "@/lib/validations/zod-helpers";

// Phone shape: digits, +, spaces, dashes, parens. 6–20 chars.
// Permissive on purpose — Indonesian families type numbers in many shapes
// ("0812-3456-7890", "+62 812 3456 7890", "(021) 555-1234"). Server-side
// trim happens before this regex matches; client-side input mode="tel".
const PHONE_REGEX = /^[+\d\s\-()]{6,20}$/;

// CUID shape — Prisma cuids are 25 chars starting with c.
// Loosened to "starts with c, 24+ alphanumeric" to tolerate cuid v2 if that
// ever lands. Empty/missing programId is allowed (form lets applicant skip).
const CUID_REGEX = /^c[a-z0-9]{24,}$/i;

// ISO date: YYYY-MM-DD only. HTML5 type="date" emits this exact shape.
// We do NOT accept full ISO 8601 timestamps — the existing Admission.dateOfBirth
// is a string column treated as a date-only value.
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Public-admission submit schema. Subset of `createAdmissionSchema`
 * (lib/validations/admission.ts) — does NOT expose `source` (server-side
 * hard-codes WEBSITE), `status` (defaults INQUIRY at DB), `studentId`,
 * `tenantId` (server-side findFirst), `parentEducation`, `parentOccupation`,
 * `parentIncome`, or `followUpDate` (admin-only knobs).
 *
 * Zod v4 `z.object()` defaults to strip mode: unknown keys passed in by an
 * attacker (e.g. `source: "REFERRAL"`, `status: "ADMITTED"`, `tenantId: "x"`)
 * are removed from the parsed result, neither rejected nor forwarded. The
 * route never reads them after parse.
 */
export const submitAdmissionSchema = z.object({
  childName: z
    .string()
    .trim()
    .min(1, "Nama anak wajib diisi")
    .max(80, "Nama anak terlalu panjang"),
  dateOfBirth: z
    .string()
    .regex(ISO_DATE_REGEX, "Tanggal lahir wajib diisi (format YYYY-MM-DD)"),
  childGender: z.enum(["L", "P"], { error: "Pilih jenis kelamin" }),
  parentName: z
    .string()
    .trim()
    .min(1, "Nama orang tua wajib diisi")
    .max(80, "Nama orang tua terlalu panjang"),
  parentPhone: z
    .string()
    .trim()
    .regex(PHONE_REGEX, "Nomor telepon tidak valid"),
  parentWhatsapp: optionalTrimmed(z.string().regex(PHONE_REGEX, "Nomor WhatsApp tidak valid")),
  parentEmail: optionalTrimmed(z.string().email("Email tidak valid")),
  programId: optionalTrimmed(z.string().regex(CUID_REGEX, "Program tidak valid")),
  notes: optionalTrimmed(z.string().max(500, "Catatan terlalu panjang (maksimal 500 karakter)")),
});

export type SubmitAdmissionInput = z.infer<typeof submitAdmissionSchema>;

/**
 * Flatten Zod error into a `{ fieldName: message }` shape for the 400 response.
 * One message per field — first error wins (sufficient for inline form display).
 */
export function flattenSubmitErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "_root";
    if (!(path in out)) out[path] = issue.message;
  }
  return out;
}
