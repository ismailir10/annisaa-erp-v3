// @public — public Address create endpoint scoped to a tenant slug.
//
// Backs the `<AddressChainField>` save action on /daftar (the existing
// scaffold createAddress action requires getSession; the public form has
// no session). Validates the address payload via the existing
// `addressSchema` (BPS chain refinement included) + a top-level
// `tenantSlug` resolver. Rate-limited at 20/IP/5min — looser than the
// admission-submit limit because users may save → cancel → resave several
// times while filling the form.
//
// Cycle: docs/cycles/2026-05-10-p2-admission-funnel-ui-public.md (T9)

import { NextResponse, type NextRequest } from "next/server";
import { z, ZodError } from "zod";

import { prisma } from "@/lib/db";
import { addressSchema } from "@/lib/entities/address/schema";
import { getClientIp } from "@/lib/http/ip";
import { checkRateLimit } from "@/lib/rate-limit";

const PUBLIC_ADDRESS_RATE_LIMIT = 20;
const PUBLIC_ADDRESS_WINDOW_MS = 5 * 60 * 1000;

const publicAddressSchema = z
  .object({ tenantSlug: z.string().min(1).max(50) })
  .and(addressSchema)
  // .strict() not chainable here because addressSchema uses superRefine — but
  // the union of two object schemas already rejects unknown top-level keys
  // at parse time only when we explicitly drop them. Defense-in-depth: the
  // Address create call below picks only the address fields, never the
  // raw input bag.
  ;

function jsonError(status: number, error: string, message: string, field?: string): NextResponse {
  return NextResponse.json(
    field ? { error, message, field } : { error, message },
    { status },
  );
}

function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const reqUrl = new URL(request.url);
    return new URL(origin).origin === reqUrl.origin;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Reject cross-site POSTs. The /daftar page submits same-origin via fetch
  // which carries Origin automatically; an attacker page POSTing from a
  // different origin would be blocked here. Same-origin assumption is
  // enforced because there is no auth gate to backstop CSRF.
  if (!isSameOrigin(request)) {
    return jsonError(403, "forbidden", "Origin mismatch.");
  }

  const ip = getClientIp(request);
  const rate = checkRateLimit({
    key: ip,
    scope: "public_address_create",
    limit: PUBLIC_ADDRESS_RATE_LIMIT,
    windowMs: PUBLIC_ADDRESS_WINDOW_MS,
  });
  if (!rate.ok) {
    return NextResponse.json(
      { error: "rate_limited", message: "Terlalu banyak permintaan dari koneksi ini." },
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

  let input: z.infer<typeof publicAddressSchema>;
  try {
    input = publicAddressSchema.parse(raw);
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
    select: { id: true },
  });
  if (!tenant) {
    // Uniform 400 — do not leak which slugs exist via 404 vs 200.
    return jsonError(400, "invalid_payload", "Payload validation failed.", "tenantSlug");
  }

  try {
    const address = await prisma.address.create({
      data: {
        tenantId: tenant.id,
        provinceId: input.provinceId,
        regencyId: input.regencyId,
        districtId: input.districtId,
        villageId: input.villageId,
        streetLine: input.streetLine,
        rt: input.rt,
        rw: input.rw,
        postalCode: input.postalCode,
        notes: input.notes,
      },
      select: { id: true },
    });
    return NextResponse.json({ ok: true, addressId: address.id });
  } catch (err) {
    console.error("public.address.create failed", err);
    return jsonError(500, "address_create_failed", "Gagal menyimpan alamat.");
  }
}
