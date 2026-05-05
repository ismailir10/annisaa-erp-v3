"use client";

import * as React from "react";

import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import type { FieldDef } from "../entity";
import type { FieldRendererProps } from "./text";

type MultiselectDef = Extract<FieldDef, { kind: "MULTISELECT" }>;

export function MultiselectRenderer({ field, def, disabled, ariaInvalid }: FieldRendererProps) {
  if (def.kind !== "MULTISELECT") {
    throw new Error(`MultiselectRenderer received non-MULTISELECT FieldDef (kind="${def.kind}")`);
  }
  const t = def as MultiselectDef;
  const { name, value, onChange, onBlur } = field;
  const stored = (Array.isArray(value) ? (value as string[]) : []) ?? [];
  const labelOf = (v: string) => t.options.find((o) => o.value === v)?.label ?? v;

  return (
    <Combobox
      multiple
      value={stored}
      onValueChange={(next: string[]) => {
        onChange(next);
        onBlur();
      }}
      disabled={disabled}
      items={t.options}
    >
      <ComboboxChips aria-invalid={ariaInvalid || undefined}>
        {stored.map((v) => (
          <ComboboxChip key={v}>{labelOf(v)}</ComboboxChip>
        ))}
        <ComboboxChipsInput name={name} placeholder={stored.length ? "" : "Pilih opsi"} />
      </ComboboxChips>
      <ComboboxContent>
        <ComboboxList>
          {t.options.map((o) => (
            <ComboboxItem key={o.value} value={o.value}>
              {o.label}
            </ComboboxItem>
          ))}
          <ComboboxEmpty>Tidak ada hasil</ComboboxEmpty>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
