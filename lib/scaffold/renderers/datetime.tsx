"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fmt } from "../format";
import type { FieldDef } from "../entity";
import type { FieldRendererProps } from "./text";

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));
const JKT_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Jakarta",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hour12: false,
});

// Extract Jakarta-local parts. `date` is a local-time Date whose Y/M/D
// matches the Jakarta date (so react-day-picker highlights the right cell
// regardless of the browser's tz). h/m are the Jakarta hour/minute,
// snapped to 5-minute increments.
function jakartaParts(iso: string | undefined) {
  if (!iso) return { date: undefined as Date | undefined, h: "00", m: "00" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: undefined, h: "00", m: "00" };
  const parts = Object.fromEntries(JKT_FMT.formatToParts(d).map((p) => [p.type, p.value]));
  const cal = new Date(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  const m5 = String(Math.floor(Number(parts.minute) / 5) * 5).padStart(2, "0");
  return { date: cal, h: parts.hour, m: m5 };
}

// Compose ISO with explicit +07:00 offset so storage is unambiguous and
// independent of the browser's local tz. `date` is the calendar Date (its
// local Y/M/D are already Jakarta date by construction).
function compose(date: Date | undefined, h: string, m: string): string {
  if (!date) return "";
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}T${h}:${m}:00+07:00`;
}

export function DateTimeRenderer({ field, def, disabled, ariaInvalid }: FieldRendererProps) {
  if (def.kind !== "DATETIME") {
    throw new Error(`DateTimeRenderer received non-DATETIME FieldDef (kind="${def.kind}")`);
  }
  void (def as Extract<FieldDef, { kind: "DATETIME" }>);
  const { name, value, onChange, onBlur } = field;
  const [open, setOpen] = React.useState(false);
  const stored = (value as string | undefined) ?? "";
  const { date, h, m } = jakartaParts(stored);
  const update = (next: { date?: Date; h?: string; m?: string }) => {
    const nd = next.date ?? date;
    const nh = next.h ?? h;
    const nm = next.m ?? m;
    onChange(compose(nd, nh, nm));
    onBlur();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button type="button" variant="outline" disabled={disabled} aria-invalid={ariaInvalid || undefined} className="w-full justify-start font-normal" />}
      >
        <input type="hidden" name={name} value={stored} />
        <CalendarIcon className="mr-2 size-4 opacity-50" />
        {date ? fmt.dateTime(date) : <span className="text-muted-foreground">Pilih tanggal & jam</span>}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar mode="single" selected={date} onSelect={(d) => update({ date: d ?? undefined })} autoFocus />
        <div className="flex gap-2 border-t p-2">
          <Select value={h} onValueChange={(v: string | null) => v && update({ h: v })}>
            <SelectTrigger className="w-20"><SelectValue placeholder="Jam" /></SelectTrigger>
            <SelectContent>{HOURS.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={m} onValueChange={(v: string | null) => v && update({ m: v })}>
            <SelectTrigger className="w-20"><SelectValue placeholder="Menit" /></SelectTrigger>
            <SelectContent>{MINUTES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </PopoverContent>
    </Popover>
  );
}
