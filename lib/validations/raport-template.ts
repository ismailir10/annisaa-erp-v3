import { z } from "zod";
import {
  achievementLevelSchema,
  bucketedSectionSchema,
} from "./raport";

/**
 * Validation for the kisi-kisi narrative templates (master design §2.3).
 * User-facing copy is Indonesian; field identifiers are English.
 */

export const ageGroupSchema = z.enum(["A", "B"]);

/** The 3 single-content sections — no level dimension. */
export const closingSectionSchema = z.enum([
  "CLOSING",
  "FOLLOW_UP_PLAN",
  "HOME_ACTIVITIES",
]);

/**
 * Narrative bodies are markdown paragraphs a walas team writes by hand.
 * 4 000 chars is ~600 words — far above any real raport section, low enough
 * that a paste-bomb can't bloat the row.
 */
const templateContent = z
  .string()
  .max(4000, "Narasi maksimal 4.000 karakter");

export const narrativeSlotSchema = z.object({
  section: bucketedSectionSchema,
  level: achievementLevelSchema,
  content: templateContent,
});

export const closingSlotSchema = z.object({
  section: closingSectionSchema,
  content: templateContent,
});

/**
 * Bulk upsert. Partial by design — the authoring UI saves the whole grid, but
 * a caller may send a single slot. An empty-string `content` deletes that
 * slot (soft-delete), which is how the UI clears a template.
 */
export const raportTemplateUpsertSchema = z
  .object({
    termId: z.string().min(1, "Triwulan wajib dipilih"),
    ageGroup: ageGroupSchema,
    narratives: z.array(narrativeSlotSchema).max(15).optional(),
    closings: z.array(closingSlotSchema).max(3).optional(),
  })
  .refine(
    (v) => (v.narratives?.length ?? 0) + (v.closings?.length ?? 0) > 0,
    { message: "Tidak ada kisi-kisi yang dikirim" },
  )
  .refine(
    (v) => {
      const keys = (v.narratives ?? []).map((n) => `${n.section}:${n.level}`);
      return new Set(keys).size === keys.length;
    },
    { message: "Ada slot narasi yang dikirim lebih dari sekali" },
  )
  .refine(
    (v) => {
      const keys = (v.closings ?? []).map((c) => c.section);
      return new Set(keys).size === keys.length;
    },
    { message: "Ada slot penutup yang dikirim lebih dari sekali" },
  );

/**
 * Clone every template from one (term, ageGroup) into another. Cross-ageGroup
 * clones are allowed — TK A's wording is often the sensible starting point
 * for TK B — so only the (term, ageGroup) pair as a whole must differ.
 */
export const raportTemplateCloneSchema = z
  .object({
    sourceTermId: z.string().min(1, "Triwulan sumber wajib dipilih"),
    sourceAgeGroup: ageGroupSchema,
    targetTermId: z.string().min(1, "Triwulan tujuan wajib dipilih"),
    targetAgeGroup: ageGroupSchema,
  })
  .refine(
    (v) =>
      !(v.sourceTermId === v.targetTermId && v.sourceAgeGroup === v.targetAgeGroup),
    { message: "Triwulan sumber dan tujuan tidak boleh sama" },
  );

export type RaportTemplateUpsertInput = z.infer<typeof raportTemplateUpsertSchema>;
export type RaportTemplateCloneInput = z.infer<typeof raportTemplateCloneSchema>;
