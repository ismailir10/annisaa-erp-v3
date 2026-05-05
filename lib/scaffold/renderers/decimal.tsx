import * as React from "react";

import { Input } from "@/components/ui/input";
import type { FieldDef } from "../entity";
import type { FieldRendererProps } from "./text";

type DecimalDef = Extract<FieldDef, { kind: "DECIMAL" }>;

export function DecimalRenderer({ field, def, disabled, ariaInvalid }: FieldRendererProps) {
  if (def.kind !== "DECIMAL") {
    throw new Error(`DecimalRenderer received non-DECIMAL FieldDef (kind="${def.kind}")`);
  }
  const t = def as DecimalDef;
  const precision = t.precision ?? 2;
  const step = Math.pow(10, -precision);
  const { ref, name, value, onChange, onBlur } = field;
  return (
    <Input
      type="number"
      step={step}
      min={t.min}
      max={t.max}
      inputMode="decimal"
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
        const parsed = Number.parseFloat(raw);
        onChange(Number.isFinite(parsed) ? parsed : null);
      }}
      onBlur={onBlur}
    />
  );
}
