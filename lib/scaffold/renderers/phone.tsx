"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { fmt } from "../format";
import type { FieldDef } from "../entity";
import type { FieldRendererProps } from "./text";

function canonicalize(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (!digits) return "";
  const trimmed = digits.startsWith("62")
    ? digits.slice(2)
    : digits.startsWith("0")
      ? digits.slice(1)
      : digits;
  return `+62${trimmed}`;
}

export function PhoneRenderer({ field, def, disabled, ariaInvalid }: FieldRendererProps) {
  if (def.kind !== "PHONE") {
    throw new Error(`PhoneRenderer received non-PHONE FieldDef (kind="${def.kind}")`);
  }
  void (def as Extract<FieldDef, { kind: "PHONE" }>);
  const { ref, name, value, onChange, onBlur } = field;
  const stored = (value as string | undefined) ?? "";
  // Empty-stored guard is load-bearing: `fmt.phone("")` returns FALLBACK
  // ("—"), which would render as the visible input value. Do not collapse
  // this ternary — keep `stored ? fmt.phone(stored) : ""` intact.
  const [displayValue, setDisplayValue] = React.useState<string>(() =>
    stored ? fmt.phone(stored) : "",
  );
  React.useEffect(() => {
    setDisplayValue(stored ? fmt.phone(stored) : "");
  }, [stored]);

  return (
    <Input
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      name={name}
      disabled={disabled}
      aria-invalid={ariaInvalid || undefined}
      ref={ref}
      value={displayValue}
      onChange={(e) => setDisplayValue(e.target.value)}
      onBlur={(e) => {
        const canonical = canonicalize(e.target.value);
        onChange(canonical);
        setDisplayValue(canonical ? fmt.phone(canonical) : "");
        onBlur();
      }}
    />
  );
}
