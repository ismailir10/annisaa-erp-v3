import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";
import { validateBody } from "@/lib/api/validate";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { raportTemplateCloneSchema } from "@/lib/validations/raport-template";
import { planClone } from "@/lib/raport/templates";
import {
  RAPORT_WRITE_BUDGET,
  RAPORT_WRITE_WINDOW_MS,
  resolveTerm,
} from "../../_helpers";
import { loadTemplateGrid } from "../_shared";

/**
 * POST /api/admin/raport/templates/clone
 *
 * Copy a cohort's kisi-kisi into another (term, ageGroup) — the "reusable
 * next academic year" path from the master design §2.3.
 *
 * Slots already carrying text in the target are SKIPPED, never overwritten:
 * cloning into a partly-authored term is the common case (someone starts
 * typing, then remembers last term exists), and silently replacing their
 * wording would be the worse failure. The response reports both counts.
 *
 * Gated by `reportCard.template`. Tenant-scoped, rate-limited, audited.
 */
export async function POST(req: NextRequest) {
  const auth = await requirePermission("reportCard.template");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const { success } = rateLimit(
    `raport-template-clone:${getClientIp(req)}`,
    RAPORT_WRITE_BUDGET,
    RAPORT_WRITE_WINDOW_MS,
  );
  if (!success) {
    return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });
  }

  const result = await validateBody(raportTemplateCloneSchema, await req.json());
  if (result.error) return result.error;
  const { sourceTermId, sourceAgeGroup, targetTermId, targetAgeGroup } = result.data;

  // Both terms must belong to the caller's tenant — this is the tenant gate
  // for every row written below.
  const [sourceTerm, targetTerm] = await Promise.all([
    resolveTerm(session.tenantId, sourceTermId),
    resolveTerm(session.tenantId, targetTermId),
  ]);
  if (!sourceTerm) {
    return NextResponse.json(
      { error: "Triwulan sumber tidak ditemukan." },
      { status: 404 },
    );
  }
  if (!targetTerm) {
    return NextResponse.json(
      { error: "Triwulan tujuan tidak ditemukan." },
      { status: 404 },
    );
  }

  const tenantId = session.tenantId;
  const [source, target] = await Promise.all([
    loadTemplateGrid(tenantId, sourceTermId, sourceAgeGroup),
    loadTemplateGrid(tenantId, targetTermId, targetAgeGroup),
  ]);

  if (source.filledCount === 0) {
    return NextResponse.json(
      { error: "Triwulan sumber belum punya kisi-kisi untuk disalin." },
      { status: 422 },
    );
  }

  const plan = planClone(source, target);

  await prisma.$transaction(async (tx) => {
    for (const slot of plan.bucketed) {
      await tx.reportNarrativeTemplate.upsert({
        where: {
          tenantId_termId_ageGroup_section_level: {
            tenantId,
            termId: targetTermId,
            ageGroup: targetAgeGroup,
            section: slot.section as never,
            level: slot.level as never,
          },
        },
        create: {
          tenantId,
          termId: targetTermId,
          ageGroup: targetAgeGroup,
          section: slot.section as never,
          level: slot.level as never,
          content: slot.content,
          authoredById: session.id,
        },
        // Only reached for a soft-deleted row — live rows were filtered out
        // by planClone, so this cannot clobber authored text.
        update: { content: slot.content, authoredById: session.id, deletedAt: null },
      });
    }
    for (const slot of plan.closing) {
      await tx.reportClosingTemplate.upsert({
        where: {
          tenantId_termId_ageGroup_section: {
            tenantId,
            termId: targetTermId,
            ageGroup: targetAgeGroup,
            section: slot.section as never,
          },
        },
        create: {
          tenantId,
          termId: targetTermId,
          ageGroup: targetAgeGroup,
          section: slot.section as never,
          content: slot.content,
          authoredById: session.id,
        },
        update: { content: slot.content, authoredById: session.id, deletedAt: null },
      });
    }

    await recordAudit(
      {
        tenantId,
        actorId: session.id,
        entity: "ReportNarrativeTemplate",
        entityId: targetTermId,
        action: "create",
        after: {
          sourceTermId,
          sourceAgeGroup,
          targetTermId,
          targetAgeGroup,
          copied: plan.bucketed.length + plan.closing.length,
          skipped: plan.skipped,
        },
      },
      tx,
    );
  });

  const grid = await loadTemplateGrid(tenantId, targetTermId, targetAgeGroup);
  return NextResponse.json({
    data: {
      copied: plan.bucketed.length + plan.closing.length,
      skipped: plan.skipped,
      ...grid,
    },
  });
}
