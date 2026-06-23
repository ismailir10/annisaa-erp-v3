// @public — tokenized enrollment final submit. NO session; the unguessable
// accessToken is the credential. See proxy.ts public allow-list.
import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { resolveEnrollmentAccess } from "@/lib/enrollment/resolve-token";
import { submitEnrollmentSchema, flattenSubmitErrors } from "@/lib/enrollment/submit-validation";

const RATE_LIMIT_PER_MIN = 10;
const RATE_WINDOW_MS = 60_000;

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limit = rateLimit(`enroll-submit:${getClientIp(req)}`, RATE_LIMIT_PER_MIN, RATE_WINDOW_MS);
  if (!limit.success) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { token } = await params;
  const now = new Date();
  const { access, id } = await resolveEnrollmentAccess(token, now);
  if (access === "NOT_FOUND") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (access === "EXPIRED") return NextResponse.json({ error: "EXPIRED" }, { status: 410 });
  if (access === "SUBMITTED")
    return NextResponse.json({ error: "ALREADY_SUBMITTED" }, { status: 409 });
  if (!id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "validation_failed", fields: { _root: "Body bukan JSON yang valid" } },
      { status: 400 },
    );
  }

  const parsed = submitEnrollmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", fields: flattenSubmitErrors(parsed.error) },
      { status: 422 },
    );
  }
  const data = parsed.data;
  const nowIso = now.toISOString();

  // Server-stamp the signing time — client-supplied signedAt is not trusted.
  const consentData = {
    ...data.consentData,
    ayah: { ...data.consentData.ayah, signedAt: nowIso },
    ibu: { ...data.consentData.ibu, signedAt: nowIso },
  };

  // Guard the INVITED→SUBMITTED transition at the DB layer too: updateMany with
  // a status predicate makes a double-submit race a no-op (count 0) rather than
  // overwriting an already-submitted row.
  const result = await prisma.enrollmentApplication.updateMany({
    where: { id, status: "INVITED" },
    data: {
      status: "SUBMITTED",
      submittedAt: now,
      childName: data.studentData.childName,
      programId: data.programId,
      dcareAddon: data.dcareAddon,
      studentData: data.studentData,
      ayahData: data.ayahData,
      ibuData: data.ibuData,
      consentData,
    },
  });
  if (result.count === 0) {
    // Lost the race — someone already submitted between resolve and update.
    return NextResponse.json({ error: "ALREADY_SUBMITTED" }, { status: 409 });
  }

  return NextResponse.json({ ok: true, id }, { status: 201 });
}
