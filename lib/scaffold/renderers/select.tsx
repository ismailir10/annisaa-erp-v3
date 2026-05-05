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

type SelectFieldDef = Extract<FieldDef, { kind: "SELECT" }>;

export function SelectRenderer({ field, def, disabled, ariaInvalid }: FieldRendererProps) {
  if (def.kind !== "SELECT") {
    throw new Error(`SelectRenderer received non-SELECT FieldDef (kind="${def.kind}")`);
  }
  const t = def as SelectFieldDef;
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
        className="w-full"
      >
        <SelectValue placeholder="Pilih opsi" />
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
