"use client";

import { useCallback, useState } from "react";

import { AsyncCombobox } from "@/components/ui/async-combobox";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

export type PickableParent = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  childCount: number;
};

const PAGE_SIZE = 20;

// ------------------------------------------------------------------
// Parent picker — built on the shared AsyncCombobox primitive, mirrors
// components/admin/student-picker.tsx.
// ------------------------------------------------------------------

/**
 * Search the tenant's existing wali so one Parent record can be shared across
 * siblings. `excludeIds` drops parents already linked to this student — they
 * would only ever come back as a 409.
 */
export function ParentPicker({
  id,
  selected,
  onSelect,
  excludeIds = [],
}: {
  id?: string;
  selected: PickableParent | null;
  onSelect: (p: PickableParent | null) => void;
  excludeIds?: string[];
}) {
  const [total, setTotal] = useState(0);
  const excludeKey = excludeIds.join(",");

  const fetcher = useCallback(
    async (query: string, signal: AbortSignal): Promise<PickableParent[]> => {
      try {
        const q = query.trim();
        const res = await fetch(
          `/api/guardians?search=${encodeURIComponent(q)}&status=ACTIVE&pageSize=${PAGE_SIZE}`,
          { signal },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const excluded = new Set(excludeKey ? excludeKey.split(",") : []);
        const results: PickableParent[] = (json?.data ?? [])
          .filter((p: { id: string }) => !excluded.has(p.id))
          .map(
            (p: {
              id: string;
              name: string;
              phone: string | null;
              email: string | null;
              _count?: { guardians?: number };
            }) => ({
              id: p.id,
              name: p.name,
              phone: p.phone ?? null,
              email: p.email ?? null,
              childCount: p._count?.guardians ?? 0,
            }),
          );
        setTotal((json?.pagination?.total ?? results.length) as number);
        return results;
      } catch (err) {
        if ((err as { name?: string })?.name !== "AbortError") {
          console.error("[parent-picker] guardians fetch failed", err);
        }
        throw err;
      }
    },
    [excludeKey],
  );

  return (
    <AsyncCombobox<PickableParent>
      id={id}
      value={selected}
      onChange={onSelect}
      fetcher={fetcher}
      getKey={(p) => p.id}
      getLabel={(p) => `${p.name}${p.phone ? ` · ${p.phone}` : ""}`}
      renderItem={(p) => (
        <span className="flex flex-col">
          <span>{p.name}</span>
          <span className="text-xs text-muted-foreground">
            {[p.phone, p.email, `${p.childCount} anak terdaftar`]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
      )}
      placeholder="Cari wali yang sudah terdaftar..."
      searchPlaceholder="Cari nama, telepon, atau email..."
      idleText="Ketik nama wali untuk mencari."
      emptyText={(query) =>
        `Tidak ada wali cocok dengan "${query}". Periksa ejaan, atau tambahkan wali baru.`
      }
      errorText="Gagal memuat data wali. Coba lagi."
      clearAriaLabel="Hapus pilihan wali"
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
