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
  return (
    <Input
      type="text"
      name={field.name}
      placeholder={t.placeholder}
      maxLength={t.maxLength}
      disabled={disabled}
      aria-invalid={ariaInvalid || undefined}
      ref={field.ref}
      value={(field.value as string | undefined) ?? ""}
      onChange={field.onChange}
      onBlur={field.onBlur}
    />
  );
}
