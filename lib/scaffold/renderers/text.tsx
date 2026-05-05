import * as React from "react";
import type { ControllerRenderProps, FieldValues } from "react-hook-form";

import { Input } from "@/components/ui/input";
import type { FieldDef } from "../entity";

export type FieldRendererProps = {
  field: ControllerRenderProps<FieldValues, string>;
  def: FieldDef;
  disabled?: boolean;
  ariaInvalid?: boolean;
};

type TextDef = Extract<FieldDef, { kind: "TEXT" }>;

export function TextRenderer({ field, def, disabled, ariaInvalid }: FieldRendererProps) {
  if (def.kind !== "TEXT") {
    throw new Error(`TextRenderer received non-TEXT FieldDef (kind="${def.kind}")`);
  }
  const t = def as TextDef;
  // Destructure once to satisfy react-hooks/refs (no `.x` access on
  // ref-bearing objects during render).
  const { ref, name, value, onChange, onBlur } = field;
  return (
    <Input
      type="text"
      name={name}
      placeholder={t.placeholder}
      maxLength={t.maxLength}
      disabled={disabled}
      aria-invalid={ariaInvalid || undefined}
      ref={ref}
      value={(value as string | undefined) ?? ""}
      onChange={onChange}
      onBlur={onBlur}
    />
  );
}
