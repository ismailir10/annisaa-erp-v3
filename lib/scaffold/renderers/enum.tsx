"use client";

import * as React from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FieldDef } from "../entity";
import type { FieldRendererProps } from "./text";

type EnumDef = Extract<FieldDef, { kind: "ENUM" }>;

export function EnumRenderer({ field, def, disabled, ariaInvalid }: FieldRendererProps) {
  if (def.kind !== "ENUM") {
    throw new Error(`EnumRenderer received non-ENUM FieldDef (kind="${def.kind}")`);
  }
  const t = def as EnumDef;
  const { name, value, onChange, onBlur } = field;
  const stored = (value as string | undefined) ?? "";

  return (
    <Select
      value={stored}
      onValueChange={(v: string | null) => {
        onChange(v ?? "");
        onBlur();
      }}
      disabled={disabled}
    >
      <SelectTrigger
        name={name}
        aria-invalid={ariaInvalid || undefined}
        data-enum={t.enumName}
        className="w-full"
      >
        <SelectValue placeholder="Pilih" />
      </SelectTrigger>
      <SelectContent>
        {t.options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
