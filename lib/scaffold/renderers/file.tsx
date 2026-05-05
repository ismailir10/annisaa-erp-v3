"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import type { FieldDef } from "../entity";
import type { FieldRendererProps } from "./text";

type FileFieldDef = Extract<FieldDef, { kind: "FILE" }>;

export function FileRenderer({ field, def, disabled, ariaInvalid }: FieldRendererProps) {
  if (def.kind !== "FILE") {
    throw new Error(`FileRenderer received non-FILE FieldDef (kind="${def.kind}")`);
  }
  const t = def as FileFieldDef;
  const { ref, name, onChange, onBlur } = field;
  const [error, setError] = React.useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1">
      <Input
        type="file"
        name={name}
        accept={t.accept}
        disabled={disabled}
        aria-invalid={ariaInvalid || undefined}
        ref={ref}
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          if (f && t.maxBytes != null && f.size > t.maxBytes) {
            setError("Berkas terlalu besar");
            onChange(null);
            return;
          }
          setError(null);
          onChange(f);
        }}
        onBlur={onBlur}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
