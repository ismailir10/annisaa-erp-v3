import * as React from "react";

import { Input } from "@/components/ui/input";
import type { FieldDef } from "../entity";
import type { FieldRendererProps } from "./text";

export function EmailRenderer({ field, def, disabled, ariaInvalid }: FieldRendererProps) {
  if (def.kind !== "EMAIL") {
    throw new Error(`EmailRenderer received non-EMAIL FieldDef (kind="${def.kind}")`);
  }
  void (def as Extract<FieldDef, { kind: "EMAIL" }>);
  const { ref, name, value, onChange, onBlur } = field;
  return (
    <Input
      type="email"
      inputMode="email"
      autoComplete="email"
      name={name}
      disabled={disabled}
      aria-invalid={ariaInvalid || undefined}
      ref={ref}
      value={(value as string | undefined) ?? ""}
      onChange={onChange}
      onBlur={onBlur}
    />
  );
}
