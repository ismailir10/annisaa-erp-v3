// @public — public Admission submit endpoint backing the /daftar form.
//
// Flow: validate payload → resolve tenant by slug (404 on miss) → confirm
// programId + academicYearId + addressId all belong to the same tenant
// (defensive — without this an attacker could cross-tenant by guessing
// CUIDs) → call submitAdmission (single $transaction) → return tracking
// code. Rate-limited per IP at 5 requests / 5 minutes (admission_submit
// scope) — strict enough to deter mass-submit abuse, loose enough that a
// shared 4G IP at a community center can submit a few applications back-
// to-back without lockout.
//
// Defensive cross-tenant guard: each *_FK lookup uses (id, tenantId) so a
// payload that names a real CUID from a different tenant fails-closed
// before any write. Address is special — it is created by the public form
// step (via /api/regions/* + the `<AddressChainField>` save action), and
// the form must POST the addressId from THIS tenant. The endpoint trusts
// addressId only after the same-tenant check.
//
// Cycle: docs/cycles/2026-05-10-p2-admission-funnel-ui-public.md (T8)

import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";

import { prisma } from "@/lib/db";
import { submitAdmission } from "@/lib/admission/transitions/submit";
import { publicSubmitSchema } from "@/lib/admission/validations/public-submit";
import { getClientIp } from "@/lib/http/ip";
import { checkRateLimit } from "@/lib/rate-limit";

const SUBMIT_RATE_LIMIT = 5;
const SUBMIT_WINDOW_MS = 5 * 60 * 1000;

function jsonError(status: number, error: string, message: string, field?: string): NextResponse {
  return NextResponse.json(
    field ? { error, message, field } : { error, message },
    { status },
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(request);
  const rate = checkRateLimit({
    key: ip,
    scope: "admission_submit",
    limit: SUBMIT_RATE_LIMIT,
    windowMs: SUBMIT_WINDOW_MS,
  });
  if (!rate.ok) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message:
          "Terlalu banyak pendaftaran dari koneksi ini. Mohon coba lagi sebentar.",
      },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) },
      },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError(400, "invalid_json", "Body must be valid JSON.");
  }

  let input: ReturnType<typeof publicSubmitSchema.parse>;
  try {
    input = publicSubmitSchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) {
      const issue = err.issues[0];
      return jsonError(
        400,
        "invalid_payload",
        issue?.message ?? "Payload validation failed.",
        issue?.path?.join(".") ?? undefined,
      );
    }
    throw err;
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug: input.tenantSlug },
    select: { id: true, name: true },
  });
  if (!tenant) {
    return jsonError(404, "tenant_not_found", "Sekolah tidak ditemukan.");
  }

  // Cross-tenant guard — every FK must belong to the resolved tenant.
  const [program, academicYear, address] = await Promise.all([
    prisma.program.findFirst({
      where: { id: input.programId, tenantId: tenant.id, deletedAt: null },
      select: { id: true },
    }),
    prisma.academicYear.findFirst({
      where: { id: input.academicYearId, tenantId: tenant.id, deletedAt: null },
      select: { id: true },
    }),
    prisma.address.findFirst({
      where: { id: input.addressId, tenantId: tenant.id, deletedAt: null },
      select: { id: true },
    }),
  ]);
  if (!program) return jsonError(400, "invalid_program", "Program tidak ditemukan.", "programId");
  if (!academicYear) {
    return jsonError(400, "invalid_academic_year", "Tahun ajaran tidak ditemukan.", "academicYearId");
  }
  if (!address) {
    return jsonError(400, "invalid_address", "Alamat tidak ditemukan.", "addressId");
  }

  const userAgent = request.headers.get("user-agent") ?? null;

  try {
    const result = await submitAdmission(prisma, {
      tenantId: tenant.id,
      programId: input.programId,
      academicYearId: input.academicYearId,
      addressId: input.addressId,
      source: input.source,
      referralSourceText: input.referralSourceText ?? null,
      applicantFullName: input.applicantFullName,
      applicantNickname: input.applicantNickname ?? null,
      applicantNik: input.applicantNik ?? null,
      applicantBirthDate: input.applicantBirthDate ?? null,
      applicantGender: input.applicantGender ?? null,
      applicantBirthPlace: input.applicantBirthPlace ?? null,
      fatherName: input.fatherName ?? null,
      fatherNik: input.fatherNik ?? null,
      fatherPhone: input.fatherPhone ?? null,
      fatherOccupation: input.fatherOccupation ?? null,
      fatherMonthlyIncome: input.fatherMonthlyIncome ?? null,
      motherName: input.motherName ?? null,
      motherNik: input.motherNik ?? null,
      motherPhone: input.motherPhone ?? null,
      motherOccupation: input.motherOccupation ?? null,
      motherMonthlyIncome: input.motherMonthlyIncome ?? null,
      notes: input.notes ?? null,
      notificationEmail: input.notificationEmail,
      tenantDisplayName: tenant.name,
      ipAddress: ip,
      userAgent,
    });

    return NextResponse.json({
      ok: true,
      trackingCode: result.trackingCode,
      admissionId: result.admissionId,
      siblingDetectedFromHouseholdId: result.siblingDetectedFromHouseholdId,
    });
  } catch (err) {
    console.error("admission.submit failed", err);
    return jsonError(
      500,
      "submit_failed",
      "Pendaftaran gagal disimpan. Mohon coba lagi sebentar.",
    );
  }
}
