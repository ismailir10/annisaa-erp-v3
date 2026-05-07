// Server-safe form-spec extraction. Lives in its own module (no `"use client"`)
// because `formSpecFromEntity` is called from RSC pages — colocating it inside
// `form-page.tsx` (which carries `"use client"`) would mark the helper as a
// client function and Next.js refuses to invoke client functions from RSC.
//
// `ScaffoldFormSpec<T>` is the JSON-plain subset of `EntityDef<T>` that crosses
// the RSC → Client Component boundary safely. Zod schemas + dataFetcher closure
// + detailTabs render functions stay on the server side.
//
// Cycle: docs/cycles/2026-05-07-p2-scaffold-pages.md (T5)

import type { FieldValues } from "react-hook-form";
import type { EntityDef, FormSectionDef } from "./entity";

export type ScaffoldFormSpec<T extends FieldValues> = {
  labelSingular: string;
  formSections: ReadonlyArray<FormSectionDef<T>>;
};

export function formSpecFromEntity<T extends FieldValues>(
  entity: EntityDef<T>,
): ScaffoldFormSpec<T> {
  return {
    labelSingular: entity.labelSingular,
    formSections: entity.formSections,
  };
}
