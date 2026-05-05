import * as React from "react";

import { Textarea } from "@/components/ui/textarea";
import type { FieldDef } from "../entity";
import type { FieldRendererProps } from "./text";

type TextareaDef = Extract<FieldDef, { kind: "TEXTAREA" }>;

export function TextareaRenderer({ field, def, disabled, ariaInvalid }: FieldRendererProps) {
  if (def.kind !== "TEXTAREA") {
    throw new Error(`TextareaRenderer received non-TEXTAREA FieldDef (kind="${def.kind}")`);
  }
  const t = def as TextareaDef;
  const { ref, name, value, onChange, onBlur } = field;
  return (
    <Textarea
      name={name}
      placeholder={t.placeholder}
      maxLength={t.maxLength}
      rows={t.rows}
      disabled={disabled}
      aria-invalid={ariaInvalid || undefined}
      ref={ref}
      value={(value as string | undefined) ?? ""}
      onChange={onChange}
      onBlur={onBlur}
    />
  );
}
