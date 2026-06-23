import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { streamFile } from "@/lib/storage";

/**
 * GET /api/enrollments/[id]/signature?which=ayah|ibu — admin-only stream of a
 * stored consent signature image. Mirrors lib/storage/parent-document GET:
 * admin-gated, tenant-scoped, no-store, inline. Returns 404 when the token is
 * absent or the underlying object is gone.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const which = req.nextUrl.searchParams.get("which");
  if (which !== "ayah" && which !== "ibu") {
    return NextResponse.json({ error: "Parameter 'which' harus ayah atau ibu" }, { status: 400 });
  }

  const { id } = await params;
  const app = await prisma.enrollmentApplication.findUnique({
    where: { id },
    select: { tenantId: true, consentData: true },
  });
  if (!app || app.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const consent = (app.consentData ?? {}) as Record<string, { signatureToken?: unknown }>;
  const token = consent[which]?.signatureToken;
  if (typeof token !== "string" || !token) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const { stream, mimeType, filename } = await streamFile(token);
    return new Response(stream as unknown as BodyInit, {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "private, no-store",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
