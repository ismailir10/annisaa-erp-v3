// Runtime field-renderer registry per spec §5.5. The 15-kind discriminated
// union `FieldDef` is declared in `entity.ts`; this file owns the
// kind→component lookup table that the page shells (T5) consume to render
// editable form fields.
//
// Cycle p1-scaffold-engine-skeleton ships only the TEXT renderer placeholder
// to keep the cycle under §18.2's 25-file cap. The remaining 14 renderer
// implementations land in `p1-scaffold-renderers` (subagent-parallel
// dispatch). Until then, `getRenderer(kind)` throws `MissingRendererError`
// for unimplemented kinds — `scaffold-check` (T9) blocks any entity that
// references an unimplemented renderer, so downstream cycles cannot mount
// pages against gaps.

import type { ComponentType } from "react";
import type { FieldKind } from "./entity";
import { TextRenderer, type FieldRendererProps } from "./renderers/text";

export const FIELD_KINDS = [
  "TEXT",
  "TEXTAREA",
  "NUMBER",
  "DECIMAL",
  "CURRENCY",
  "DATE",
  "DATETIME",
  "BOOLEAN",
  "SELECT",
  "MULTISELECT",
  "EMAIL",
  "PHONE",
  "RELATION",
  "FILE",
  "ENUM",
] as const satisfies readonly FieldKind[];

// Compile-time exhaustiveness — fails to typecheck if `FieldKind` and
// `FIELD_KINDS` drift apart.
type _ExhaustiveCheck = Exclude<FieldKind, (typeof FIELD_KINDS)[number]>;
const _exhaustive: _ExhaustiveCheck extends never ? true : false = true;
void _exhaustive;

export class MissingRendererError extends Error {
  constructor(kind: string) {
    super(
      `No renderer registered for FieldDef kind "${kind}". ` +
        `Implementation lands in p1-scaffold-renderers; ` +
        `entity authors must wait until that cycle merges before referencing this kind.`,
    );
    this.name = "MissingRendererError";
  }
}

type RendererTable = {
  readonly [K in FieldKind]?: ComponentType<FieldRendererProps>;
};

export const FIELD_RENDERERS: RendererTable = Object.freeze({
  TEXT: TextRenderer,
});

export function getRenderer(kind: FieldKind): ComponentType<FieldRendererProps> {
  const renderer = FIELD_RENDERERS[kind];
  if (!renderer) throw new MissingRendererError(kind);
  return renderer;
}

export function hasRenderer(kind: string): kind is FieldKind {
  return (FIELD_KINDS as readonly string[]).includes(kind) && kind in FIELD_RENDERERS;
}

export type { FieldRendererProps };
