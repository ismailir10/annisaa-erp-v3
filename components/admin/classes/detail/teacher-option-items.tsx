"use client";

import { Button } from "@/components/ui/button";
import { SelectItem } from "@/components/ui/select";

import type { Employee } from "./types";

export type TeacherOptionsStatus = "loading" | "ready" | "error";

/**
 * `<SelectItem>`s for the class-detail teacher pickers (add-teacher and
 * swap-session). One place for the four states so both dialogs say the same
 * thing: loading, genuinely empty, load failed, and the list itself. A failed
 * load never reads as "no teachers" — see
 * docs/cycles/2026-10-01-teacher-picker-access.md.
 */
export function TeacherOptionItems({
  status,
  options,
}: {
  status: TeacherOptionsStatus;
  options: Employee[];
}) {
  if (status === "loading") {
    return (
      <SelectItem value="__loading" disabled>
        Memuat daftar guru…
      </SelectItem>
    );
  }
  if (status === "error") {
    return (
      <SelectItem value="__error" disabled>
        Daftar guru belum tersedia
      </SelectItem>
    );
  }
  if (options.length === 0) {
    return (
      <SelectItem value="__empty" disabled>
        Belum ada guru aktif
      </SelectItem>
    );
  }
  return (
    <>
      {options.map((e) => (
        <SelectItem key={e.id} value={e.id}>
          {e.nama}
        </SelectItem>
      ))}
    </>
  );
}

/** Inline failure row rendered under the teacher Select, with a retry. */
export function TeacherOptionsError({
  status,
  onRetry,
}: {
  status: TeacherOptionsStatus;
  onRetry: () => void;
}) {
  if (status !== "error") return null;
  return (
    <div className="flex items-center gap-2">
      <p role="alert" className="text-small text-destructive">
        Daftar guru gagal dimuat.
      </p>
      <Button type="button" variant="link" size="sm" onClick={onRetry}>
        Coba lagi
      </Button>
    </div>
  );
}
