import * as React from "react";

import { Input } from "@/components/ui/input";
import type { FieldDef } from "../entity";
import type { FieldRendererProps } from "./text";

type NumberDef = Extract<FieldDef, { kind: "NUMBER" }>;

export function NumberRenderer({ field, def, disabled, ariaInvalid }: FieldRendererProps) {
  if (def.kind !== "NUMBER") {
    throw new Error(`NumberRenderer received non-NUMBER FieldDef (kind="${def.kind}")`);
  }
  const t = def as NumberDef;
  const { ref, name, value, onChange, onBlur } = field;
  return (
    <Input
      type="number"
      step={t.step ?? 1}
      min={t.min}
      max={t.max}
      inputMode="numeric"
      name={name}
      disabled={disabled}
      aria-invalid={ariaInvalid || undefined}
      ref={ref}
      value={(value as number | string | undefined) ?? ""}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") {
          onChange(null);
          return;
        }
        const parsed = Number.parseInt(raw, 10);
        onChange(Number.isFinite(parsed) ? parsed : null);
      }}
      onBlur={onBlur}
    />
  );
}
