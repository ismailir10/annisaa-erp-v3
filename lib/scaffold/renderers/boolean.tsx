"use client";

import * as React from "react";

import { Switch } from "@/components/ui/switch";
import type { FieldDef } from "../entity";
import type { FieldRendererProps } from "./text";

type BooleanDef = Extract<FieldDef, { kind: "BOOLEAN" }>;

export function BooleanRenderer({ field, def, disabled, ariaInvalid }: FieldRendererProps) {
  if (def.kind !== "BOOLEAN") {
    throw new Error(`BooleanRenderer received non-BOOLEAN FieldDef (kind="${def.kind}")`);
  }
  const t = def as BooleanDef;
  const { name, value, onChange, onBlur } = field;
  const checked = Boolean(value);
  const trueLabel = t.trueLabel ?? "Aktif";
  const falseLabel = t.falseLabel ?? "Tidak aktif";

  return (
    <label className="flex items-center gap-3 select-none">
      <Switch
        name={name}
        checked={checked}
        disabled={disabled}
        aria-invalid={ariaInvalid || undefined}
        onCheckedChange={(next) => {
          onChange(next);
          onBlur();
        }}
      />
      <span className="text-sm text-muted-foreground">
        {checked ? trueLabel : falseLabel}
      </span>
    </label>
  );
}
