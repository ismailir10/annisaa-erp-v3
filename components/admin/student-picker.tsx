"use client";

import { useCallback, useState } from "react";

import { AsyncCombobox } from "@/components/ui/async-combobox";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

export type Student = {
  id: string;
  name: string;
  nickname: string | null;
  nis: string | null;
};

const PAGE_SIZE = 20;

// ------------------------------------------------------------------
// Student picker — built on the shared AsyncCombobox primitive.
// ------------------------------------------------------------------

export function StudentPicker({
  id,
  selected,
  onSelect,
}: {
  id?: string;
  selected: Student | null;
  onSelect: (s: Student | null) => void;
}) {
  const [total, setTotal] = useState(0);

  // No upfront `pageSize=500` fetch — the fetch only fires once the user has
  // paused typing (AsyncCombobox's debounce), which previously truncated
  // tenants beyond 500 students and added 200ms+ to first dialog open.
  const fetcher = useCallback(
    async (query: string, signal: AbortSignal): Promise<Student[]> => {
      try {
        const q = query.trim();
        const res = await fetch(
          `/api/students?search=${encodeURIComponent(q)}&status=ACTIVE&pageSize=${PAGE_SIZE}`,
          { signal },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const list: Student[] = (json?.data ?? []).map((s: Student) => ({
          id: s.id,
          name: s.name,
          nickname: s.nickname ?? null,
          nis: s.nis ?? null,
        }));
        setTotal((json?.pagination?.total ?? list.length) as number);
        return list;
      } catch (err) {
        if ((err as { name?: string })?.name !== "AbortError") {
          console.error("[student-picker] students fetch failed", err);
        }
        throw err;
      }
    },
    [],
  );

  return (
    <AsyncCombobox<Student>
      id={id}
      value={selected}
      onChange={onSelect}
      fetcher={fetcher}
      getKey={(s) => s.id}
      getLabel={(s) => `${s.name}${s.nis ? ` · ${s.nis}` : ""}`}
      renderItem={(s) => (
        <span className="flex flex-col">
          <span>
            {s.name}
            {s.nickname ? ` (${s.nickname})` : ""}
          </span>
          {s.nis && (
            <span className="text-xs text-muted-foreground">NIS {s.nis}</span>
          )}
        </span>
      )}
      placeholder="Pilih siswa..."
      searchPlaceholder="Cari nama siswa..."
      idleText="Ketik nama untuk mencari siswa."
      emptyText={(query) =>
        `Tidak ada siswa cocok dengan "${query}". Periksa ejaan.`
      }
      errorText="Gagal memuat siswa. Coba lagi."
      clearAriaLabel="Hapus pilihan siswa"
      minQueryLength={1}
      required
      footer={() =>
        total > PAGE_SIZE ? (
          <div className="border-t px-3 py-2 text-center text-xs text-muted-foreground">
            {`Menampilkan ${PAGE_SIZE} dari ${total} hasil. Persempit pencarian.`}
          </div>
        ) : null
      }
    />
  );
}
