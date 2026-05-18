// @public — intentionally unauthenticated public admission entry; rate-limited (5/min/IP).
import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { submitAdmissionSchema, flattenSubmitErrors } from "@/lib/admission/submit-validation";
import { detectSibling } from "@/lib/admission/sibling-detect";
import { sendAdmissionSubmittedEmail } from "@/lib/email/admission-submitted";

const RATE_LIMIT_PER_MIN = 5;
const RATE_WINDOW_MS = 60_000;

/**
 * Public admission submit. NO auth, NO session check — see proxy.ts public
 * allow-list. Trust boundary is THIS handler: Zod validation, server-side
 * source/status/tenant resolution, IP rate-limit, no PII echoed back.
 */
export async function POST(req: NextRequest) {
  // Rate-limit FIRST — cheap, defends against parse cost.
  // Per-IP 5/min via lib/rate-limit.ts in-memory bucket. See cycle doc
  // Spec Assumption 2 for the known-soft IP-extraction limitation.
  const ip = getClientIp(req);
  const limit = rateLimit(`admission-submit:${ip}`, RATE_LIMIT_PER_MIN, RATE_WINDOW_MS);
  if (!limit.success) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(RATE_WINDOW_MS / 1000)) } },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { error: "validation_failed", fields: { _root: "Body bukan JSON yang valid" } },
      { status: 400 },
    );
  }

  const parsed = submitAdmissionSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", fields: flattenSubmitErrors(parsed.error) },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // Resolve tenant server-side. Single-tenant invariant in v1 production.
  // Oldest ACTIVE tenant wins (deterministic, not arbitrary).
  let tenantId: string;
  try {
    const tenant = await prisma.tenant.findFirst({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!tenant) {
      console.error("[admission-submit] No ACTIVE tenant found — cannot create Admission row");
      return NextResponse.json({ error: "submit_failed" }, { status: 500 });
    }
    tenantId = tenant.id;
  } catch (err) {
    console.error("[admission-submit] Tenant lookup failed", err);
    return NextResponse.json({ error: "submit_failed" }, { status: 500 });
  }

  let admissionId: string;
  try {
    const admission = await prisma.admission.create({
      data: {
        tenantId,
        childName: data.childName,
        dateOfBirth: data.dateOfBirth,
        childGender: data.childGender,
        parentName: data.parentName,
        parentPhone: data.parentPhone,
        parentWhatsapp: data.parentWhatsapp ?? null,
        parentEmail: data.parentEmail ?? null,
        programId: data.programId ?? null,
        notes: data.notes ?? null,
        // status defaults to "INQUIRY" via prisma schema; never set explicitly here.
        // source hard-coded server-side — never read from request.
        source: "WEBSITE",
      },
      select: { id: true },
    });
    admissionId = admission.id;
  } catch (err) {
    console.error("[admission-submit] Insert failed", err);
    return NextResponse.json({ error: "submit_failed" }, { status: 500 });
  }

  // Sibling auto-detect (cycle 1.2). Runs AFTER admission.create succeeds.
  // Failure swallowed — admission stays created, applicant sees 201 unchanged,
  // admin sees the row without a "Saudara terdeteksi" chip. Per plan §7 q6
  // the surface is admin-only — no match info echoed back to the applicant.
  try {
    const match = await detectSibling(
      {
        tenantId,
        parentEmail: data.parentEmail,
        parentPhone: data.parentPhone,
      },
      prisma,
    );
    if (match) {
      await prisma.admission.update({
        where: { id: admissionId },
        data: { detectedParentId: match.parentId },
      });
    }
  } catch (err) {
    console.error(
      `[admission-submit] sibling-detect failed for admission ${admissionId}:`,
      err,
    );
  }

  // Best-effort confirmation email. Failure is swallowed (per plan §7 q4):
  // the user submitted successfully — they should see the confirmation page
  // even if Resend has a hiccup. Logged loudly for ops visibility.
  if (data.parentEmail) {
    try {
      const result = await sendAdmissionSubmittedEmail({
        tenantId,
        to: data.parentEmail,
        childName: data.childName,
        parentName: data.parentName,
      });
      if (!result.sent && result.error) {
        console.error(
          `[admission-submit] Confirmation email failed for admission ${admissionId}: ${result.error}`,
        );
      }
    } catch (err) {
      console.error(
        `[admission-submit] Confirmation email threw for admission ${admissionId}`,
        err,
      );
    }
  }

  return NextResponse.json({ id: admissionId }, { status: 201 });
}
