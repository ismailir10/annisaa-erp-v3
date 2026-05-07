"use client";

import * as React from "react";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import type { FieldDef } from "../entity";
import type { FieldRendererProps } from "./text";

type RelationDef = Extract<FieldDef, { kind: "RELATION" }>;
type Item = { id: string; label?: string };

export function RelationRenderer({ field, def, disabled, ariaInvalid }: FieldRendererProps) {
  if (def.kind !== "RELATION") throw new Error(`RelationRenderer received non-RELATION FieldDef (kind="${def.kind}")`);
  const t = def as RelationDef;
  const { name, value, onChange, onBlur } = field;
  const [q, setQ] = React.useState("");
  const [items, setItems] = React.useState<Item[]>([]);
  const [status, setStatus] = React.useState<"idle" | "loading" | "error">("idle");

  React.useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    fetch(`/api/scaffold/${t.resource}?q=${encodeURIComponent(q)}&limit=20`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { items?: Item[] }) => !cancelled && (setItems(Array.isArray(d.items) ? d.items : []), setStatus("idle")))
      .catch(() => !cancelled && setStatus("error"));
    return () => { cancelled = true; };
  }, [q, t.resource]);

  return (
    <Combobox
      value={(value as string | undefined) ?? ""}
      onValueChange={(v: string | null) => { onChange(v ?? ""); onBlur(); }}
      disabled={disabled}
      items={items.map((i) => i.id)}
    >
      <ComboboxInput name={name} aria-invalid={ariaInvalid || undefined} placeholder="Cari..." onChange={(e) => setQ(e.target.value)} />
      <ComboboxContent>
        <ComboboxList>
          {status === "loading" && <div className="p-2 text-sm text-muted-foreground">Memuat …</div>}
          {status === "error" && <div className="p-2 text-sm text-destructive">Gagal memuat</div>}
          {status === "idle" && items.map((it) => (
            <ComboboxItem key={it.id} value={it.id}>{String(it.label ?? it.id)}</ComboboxItem>
          ))}
          <ComboboxEmpty>Tidak ada hasil</ComboboxEmpty>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
