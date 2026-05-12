import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import {
  buildAdmissionFilePath,
  createSignedUploadUrl,
  ADMISSION_FILE_KINDS,
  ALLOWED_EXTENSIONS,
} from "@/lib/supabase/storage";

const BodySchema = z.object({
  admissionId: z.string().min(1),
  kind: z.enum([...ADMISSION_FILE_KINDS] as [string, ...string[]]),
  ext: z.enum([...ALLOWED_EXTENSIONS] as [string, ...string[]]),
});

// Statuses where file uploads are still meaningful (pre-PAID).
const ALLOWED_STATUSES = new Set(["INQUIRY", "VISITED", "APPLIED"]);

export async function POST(req: NextRequest) {
  // 1. Rate limit by IP (in-memory, best-effort — WAF is primary defense per spec §2.6)
  const ip = getClientIp(req);
  const { success } = rateLimit(`upload-token:${ip}`, 10, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });
  }

  // 2. Parse + validate body
  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Permintaan tidak valid", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { admissionId, kind, ext } = parsed.data;

  // 3. Look up admission (server validates ownership + status)
  const admission = await prisma.admission.findUnique({
    where: { id: admissionId },
    select: { id: true, tenantId: true, status: true },
  });
  if (!admission) {
    return NextResponse.json({ error: "Pendaftaran tidak ditemukan" }, { status: 404 });
  }
  if (!ALLOWED_STATUSES.has(admission.status)) {
    return NextResponse.json(
      { error: `Status ${admission.status} tidak menerima upload baru` },
      { status: 409 },
    );
  }

  // 4. Build canonical path + signed upload URL
  const path = buildAdmissionFilePath(
    admission.tenantId,
    admission.id,
    kind as import("@/lib/supabase/storage").AdmissionFileKind,
    ext,
  );
  const upload = await createSignedUploadUrl(path);

  return NextResponse.json({
    signedUrl: upload.signedUrl,
    token: upload.token,
    path: upload.path,
  });
}
