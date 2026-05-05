// Runtime field-renderer registry per spec §5.5. The 15-kind discriminated
// union `FieldDef` is declared in `entity.ts`; this file owns the
// kind→component lookup table that the page shells consume to render
// editable form fields.
//
// Cycle p1-scaffold-renderers fills the registry: all 15 kinds have a
// renderer. `MissingRendererError` is retained as the contract for
// future-unknown kinds (e.g. when a 16th kind is added before its
// renderer ships) and to satisfy the type-narrowing path in `getRenderer`.

import type { ComponentType } from "react";
import type { FieldKind } from "./entity";
import { TextRenderer, type FieldRendererProps } from "./renderers/text";
import { TextareaRenderer } from "./renderers/textarea";
import { NumberRenderer } from "./renderers/number";
import { DecimalRenderer } from "./renderers/decimal";
import { CurrencyRenderer } from "./renderers/currency";
import { DateRenderer } from "./renderers/date";
import { DateTimeRenderer } from "./renderers/datetime";
import { BooleanRenderer } from "./renderers/boolean";
import { SelectRenderer } from "./renderers/select";
import { MultiselectRenderer } from "./renderers/multiselect";
import { EmailRenderer } from "./renderers/email";
import { PhoneRenderer } from "./renderers/phone";
import { RelationRenderer } from "./renderers/relation";
import { FileRenderer } from "./renderers/file";
import { EnumRenderer } from "./renderers/enum";

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
        `Known kinds: ${FIELD_KINDS.join(", ")}. ` +
        `Register a renderer in lib/scaffold/field-renderer.ts before referencing this kind from any EntityDef.`,
    );
    this.name = "MissingRendererError";
  }
}

type RendererTable = {
  readonly [K in FieldKind]: ComponentType<FieldRendererProps>;
};

export const FIELD_RENDERERS: RendererTable = Object.freeze({
  TEXT: TextRenderer,
  TEXTAREA: TextareaRenderer,
  NUMBER: NumberRenderer,
  DECIMAL: DecimalRenderer,
  CURRENCY: CurrencyRenderer,
  DATE: DateRenderer,
  DATETIME: DateTimeRenderer,
  BOOLEAN: BooleanRenderer,
  SELECT: SelectRenderer,
  MULTISELECT: MultiselectRenderer,
  EMAIL: EmailRenderer,
  PHONE: PhoneRenderer,
  RELATION: RelationRenderer,
  FILE: FileRenderer,
  ENUM: EnumRenderer,
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
