import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";
import { validateBody } from "@/lib/api/validate";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { raportTemplateUpsertSchema } from "@/lib/validations/raport-template";
import { RAPORT_WRITE_BUDGET, RAPORT_WRITE_WINDOW_MS, resolveTerm } from "../_helpers";
import { loadTemplateGrid } from "./_shared";

/**
 * GET /api/admin/raport/templates?termId=&ageGroup=
 *
 * Returns the cohort's full 18-slot kisi-kisi grid (filled or empty) plus a
 * completeness count. Gated by `reportCard.template`. Tenant-scoped.
 */
export async function GET(req: NextRequest) {
  const auth = await requirePermission("reportCard.template");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const url = new URL(req.url);
  const termId = url.searchParams.get("termId") ?? "";
  const ageGroup = url.searchParams.get("ageGroup") ?? "";
  if (!termId) {
    return NextResponse.json({ error: "Parameter termId wajib diisi." }, { status: 400 });
  }
  if (ageGroup !== "A" && ageGroup !== "B") {
    return NextResponse.json(
      { error: "Parameter ageGroup harus A atau B." },
      { status: 400 },
    );
  }

  const term = await resolveTerm(session.tenantId, termId);
  if (!term) {
    return NextResponse.json({ error: "Triwulan tidak ditemukan." }, { status: 404 });
  }

  const grid = await loadTemplateGrid(session.tenantId, termId, ageGroup);
  return NextResponse.json({
    data: {
      term: {
        id: term.id,
        number: term.number,
        semesterNumber: term.semester.number,
        academicYear: term.semester.academicYear.name,
      },
      ageGroup,
      ...grid,
    },
  });
}

/**
 * PUT /api/admin/raport/templates
 *
 * Bulk-upsert a partial grid. An empty-string `content` soft-deletes that
 * slot — that is how the authoring UI clears a template, and why the write
 * is an upsert-or-delete rather than a plain upsert.
 *
 * Gated by `reportCard.template`. Tenant-scoped, rate-limited, audited.
 */
export async function PUT(req: NextRequest) {
  const auth = await requirePermission("reportCard.template");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const { success } = rateLimit(
    `raport-template-upsert:${getClientIp(req)}`,
    RAPORT_WRITE_BUDGET,
    RAPORT_WRITE_WINDOW_MS,
  );
  if (!success) {
    return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });
  }

  const result = await validateBody(raportTemplateUpsertSchema, await req.json());
  if (result.error) return result.error;
  const { termId, ageGroup, narratives = [], closings = [] } = result.data;

  // Tenant gate: the term must belong to the caller's tenant before any row
  // keyed on (tenantId, termId, …) is written.
  const term = await resolveTerm(session.tenantId, termId);
  if (!term) {
    return NextResponse.json({ error: "Triwulan tidak ditemukan." }, { status: 404 });
  }

  const tenantId = session.tenantId;
  let written = 0;
  let cleared = 0;

  await prisma.$transaction(async (tx) => {
    for (const slot of narratives) {
      const key = {
        tenantId_termId_ageGroup_section_level: {
          tenantId,
          termId,
          ageGroup,
          section: slot.section,
          level: slot.level,
        },
      };
      if (!slot.content.trim()) {
        const existing = await tx.reportNarrativeTemplate.findUnique({
          where: key,
          select: { id: true, deletedAt: true },
        });
        if (existing && !existing.deletedAt) {
          await tx.reportNarrativeTemplate.update({
            where: { id: existing.id },
            data: { deletedAt: new Date() },
          });
          cleared++;
        }
        continue;
      }
      await tx.reportNarrativeTemplate.upsert({
        where: key,
        create: {
          tenantId,
          termId,
          ageGroup,
          section: slot.section,
          level: slot.level,
          content: slot.content,
          authoredById: session.id,
        },
        // Un-delete on rewrite: the unique key survives a soft-delete, so a
        // plain create would collide.
        update: {
          content: slot.content,
          authoredById: session.id,
          deletedAt: null,
        },
      });
      written++;
    }

    for (const slot of closings) {
      const key = {
        tenantId_termId_ageGroup_section: {
          tenantId,
          termId,
          ageGroup,
          section: slot.section,
        },
      };
      if (!slot.content.trim()) {
        const existing = await tx.reportClosingTemplate.findUnique({
          where: key,
          select: { id: true, deletedAt: true },
        });
        if (existing && !existing.deletedAt) {
          await tx.reportClosingTemplate.update({
            where: { id: existing.id },
            data: { deletedAt: new Date() },
          });
          cleared++;
        }
        continue;
      }
      await tx.reportClosingTemplate.upsert({
        where: key,
        create: {
          tenantId,
          termId,
          ageGroup,
          section: slot.section,
          content: slot.content,
          authoredById: session.id,
        },
        update: {
          content: slot.content,
          authoredById: session.id,
          deletedAt: null,
        },
      });
      written++;
    }

    await recordAudit(
      {
        tenantId,
        actorId: session.id,
        entity: "ReportNarrativeTemplate",
        entityId: termId,
        action: "update",
        after: { termId, ageGroup, written, cleared },
      },
      tx,
    );
  });

  const grid = await loadTemplateGrid(tenantId, termId, ageGroup);
  return NextResponse.json({ data: { written, cleared, ...grid } });
}
