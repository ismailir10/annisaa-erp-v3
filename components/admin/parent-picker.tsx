"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, X } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; results: PickableParent[]; total: number }
  | { kind: "error" };

const PAGE_SIZE = 20;

// ------------------------------------------------------------------
// Parent picker — async combobox, mirrors components/admin/student-picker.tsx
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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [state, setState] = useState<FetchState>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement | null>(null);

  const excludeKey = excludeIds.join(",");

  const runSearch = useCallback(
    async (q: string, signal?: AbortSignal) => {
      const res = await fetch(
        `/api/guardians?search=${encodeURIComponent(q)}&status=ACTIVE&pageSize=${PAGE_SIZE}`,
        signal ? { signal } : undefined,
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
      return {
        results,
        total: (json?.pagination?.total ?? results.length) as number,
      };
    },
    [excludeKey],
  );

  // 250ms debounce, matching StudentPicker. Loading is shown only after the
  // debounce fires so the spinner doesn't flash on every keystroke.
  useEffect(() => {
    if (!open) return;

    const q = query.trim();
    if (!q) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ kind: "idle" });
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setState({ kind: "loading" });
      runSearch(q, controller.signal)
        .then(({ results, total }) => setState({ kind: "ok", results, total }))
        .catch((err) => {
          if (err?.name === "AbortError") return;
          console.error("[parent-picker] guardians fetch failed", err);
          setState({ kind: "error" });
        });
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, open, runSearch]);

  const triggerLabel = selected
    ? `${selected.name}${selected.phone ? ` · ${selected.phone}` : ""}`
    : "Cari wali yang sudah terdaftar...";

  function handleClear() {
    onSelect(null);
    setQuery("");
    setOpen(true);
    // Focus the search input once the popover has painted.
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  return (
    // The clear control sits beside the trigger rather than inside it —
    // nesting a button within the combobox button leaves the inner control
    // unreachable by keyboard and ambiguous to screen readers.
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-required="true"
          className={cn(
            "flex h-9 flex-1 items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-hidden transition-colors hover:bg-accent/30 focus-visible:ring-3 focus-visible:ring-ring/50",
            !selected && "text-muted-foreground",
          )}
        >
          <span className="truncate text-left">{triggerLabel}</span>
          <ChevronDown size={14} className="pointer-events-none shrink-0 opacity-50" />
        </PopoverTrigger>
        <PopoverContent
          className="w-[--anchor-width] min-w-[var(--anchor-width)] p-0"
          align="start"
          sideOffset={4}
        >
          <Command shouldFilter={false}>
            <CommandInput
              ref={inputRef}
              value={query}
              onValueChange={setQuery}
              placeholder="Cari nama, telepon, atau email..."
            />
            <CommandList>
              {state.kind === "idle" && (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Ketik nama wali untuk mencari.
                </div>
              )}
              {state.kind === "loading" && (
                <div className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  <span>Mencari...</span>
                </div>
              )}
              {state.kind === "error" && (
                <div className="flex flex-col items-center gap-2 px-3 py-6 text-center text-sm text-muted-foreground">
                  <span>Gagal memuat data wali. Coba lagi.</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const q = query.trim();
                      if (!q) {
                        setState({ kind: "idle" });
                        return;
                      }
                      // Retry bypasses the debounce.
                      setState({ kind: "loading" });
                      runSearch(q)
                        .then(({ results, total }) =>
                          setState({ kind: "ok", results, total }),
                        )
                        .catch(() => setState({ kind: "error" }));
                    }}
                  >
                    Coba lagi
                  </Button>
                </div>
              )}
              {state.kind === "ok" && state.results.length === 0 && (
                <CommandEmpty>
                  {`Tidak ada wali cocok dengan "${query.trim()}". Periksa ejaan, atau tambahkan wali baru.`}
                </CommandEmpty>
              )}
              {state.kind === "ok" && state.results.length > 0 && (
                <>
                  {state.results.map((p) => (
                    <CommandItem
                      key={p.id}
                      value={p.id}
                      onSelect={() => {
                        onSelect(p);
                        setOpen(false);
                        setQuery("");
                      }}
                    >
                      <span className="flex flex-col">
                        <span>{p.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {[
                            p.phone,
                            p.email,
                            `${p.childCount} anak terdaftar`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                    </CommandItem>
                  ))}
                  {state.total > PAGE_SIZE && (
                    <div className="border-t px-3 py-2 text-center text-xs text-muted-foreground">
                      {`Menampilkan ${PAGE_SIZE} dari ${state.total} hasil. Persempit pencarian.`}
                    </div>
                  )}
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected && (
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Hapus pilihan wali"
          onClick={handleClear}
          className="shrink-0 text-muted-foreground"
        >
          <X size={14} />
        </Button>
      )}
    </div>
  );
}
