"use client";

import * as React from "react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { fmt } from "../format";
import type { FieldDef } from "../entity";
import type { FieldRendererProps } from "./text";

type CurrencyDef = Extract<FieldDef, { kind: "CURRENCY" }>;

const stripDigits = (s: string) => s.replace(/\D/g, "");

function formatGrouped(digits: string, showCents?: boolean): string {
  if (!digits) return "";
  return fmt.currency(Number(digits), { showCents }).replace(/^Rp\s*/, "");
}

export function CurrencyRenderer({ field, def, disabled, ariaInvalid }: FieldRendererProps) {
  if (def.kind !== "CURRENCY") {
    throw new Error(`CurrencyRenderer received non-CURRENCY FieldDef (kind="${def.kind}")`);
  }
  const t = def as CurrencyDef;
  const { ref, name, value, onChange, onBlur } = field;
  const stored = stripDigits((value as string | undefined) ?? "");
  const [draft, setDraft] = React.useState<string | null>(null);
  const display = draft ?? formatGrouped(stored, t.showCents);

  return (
    <InputGroup aria-invalid={ariaInvalid || undefined}>
      <InputGroupAddon align="inline-start">
        <InputGroupText>Rp</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput
        type="text"
        inputMode="numeric"
        name={name}
        disabled={disabled}
        ref={ref}
        value={display}
        onFocus={() => setDraft(stored)}
        onChange={(e) => setDraft(stripDigits(e.target.value))}
        onBlur={() => {
          onChange(draft ?? stored);
          setDraft(null);
          onBlur();
        }}
      />
    </InputGroup>
  );
}
