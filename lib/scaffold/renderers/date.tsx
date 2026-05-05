"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fmt } from "../format";
import type { FieldDef } from "../entity";
import type { FieldRendererProps } from "./text";

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromISODate(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s + "T00:00:00");
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function DateRenderer({ field, def, disabled, ariaInvalid }: FieldRendererProps) {
  if (def.kind !== "DATE") {
    throw new Error(`DateRenderer received non-DATE FieldDef (kind="${def.kind}")`);
  }
  void (def as Extract<FieldDef, { kind: "DATE" }>);
  const { name, value, onChange, onBlur } = field;
  const [open, setOpen] = React.useState(false);
  const stored = (value as string | undefined) ?? "";
  const selected = fromISODate(stored);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            aria-invalid={ariaInvalid || undefined}
            className="w-full justify-start font-normal"
          />
        }
      >
        <input type="hidden" name={name} value={stored} />
        <CalendarIcon className="mr-2 size-4 opacity-50" />
        {selected ? fmt.date(selected) : <span className="text-muted-foreground">Pilih tanggal</span>}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => {
            onChange(d ? toISODate(d) : "");
            setOpen(false);
            onBlur();
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
