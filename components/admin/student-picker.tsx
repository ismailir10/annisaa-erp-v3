"use client";

import { useEffect, useRef, useState } from "react";
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

export type Student = {
  id: string;
  name: string;
  nickname: string | null;
  nis: string | null;
};

type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; results: Student[]; total: number }
  | { kind: "error" };

// ------------------------------------------------------------------
// Student picker — async combobox with 5 explicit states
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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [state, setState] = useState<FetchState>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement | null>(null);

  // 250ms debounce. Fetch only fires after the user has paused typing — no
  // upfront `pageSize=500` fetch, which previously truncated tenants beyond
  // 500 students and added 200ms+ to first dialog open.
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
      // Loading shown only after debounce fires + fetch starts — avoids
      // visual jitter during fast typing where the spinner would flash on
      // every keystroke before the request even leaves.
      setState({ kind: "loading" });
      fetch(
        `/api/students?search=${encodeURIComponent(q)}&status=ACTIVE&pageSize=20`,
        { signal: controller.signal },
      )
        .then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then((json) => {
          const list: Student[] = (json?.data ?? []).map((s: Student) => ({
            id: s.id,
            name: s.name,
            nickname: s.nickname ?? null,
            nis: s.nis ?? null,
          }));
          const total: number = json?.pagination?.total ?? list.length;
          setState({ kind: "ok", results: list, total });
        })
        .catch((err) => {
          if (err?.name === "AbortError") return;
          console.error("[manual-invoice] students fetch failed", err);
          setState({ kind: "error" });
        });
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, open]);

  // Trigger label: placeholder when empty, "${name} · ${nis}" when selected.
  const triggerLabel = selected
    ? `${selected.name}${selected.nis ? ` · ${selected.nis}` : ""}`
    : "Pilih siswa...";

  function handleClear(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onSelect(null);
    setQuery("");
    setOpen(true);
    // Focus the search input after the popover paints.
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-required="true"
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-hidden transition-colors hover:bg-accent/30 focus-visible:ring-3 focus-visible:ring-ring/50",
          !selected && "text-muted-foreground",
        )}
      >
        <span className="truncate text-left">{triggerLabel}</span>
        <span className="flex shrink-0 items-center gap-1">
          {selected ? (
            <span
              role="button"
              aria-label="Hapus pilihan siswa"
              tabIndex={0}
              onClick={handleClear}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleClear(e as unknown as React.MouseEvent);
                }
              }}
              className="inline-flex size-5 items-center justify-center rounded-sm opacity-60 hover:bg-muted hover:opacity-100"
            >
              <X size={14} />
            </span>
          ) : (
            <ChevronDown
              size={14}
              className="pointer-events-none opacity-50"
            />
          )}
        </span>
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
            placeholder="Cari nama siswa..."
          />
          <CommandList>
            {state.kind === "idle" && (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                Ketik nama untuk mencari siswa.
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
                <span>Gagal memuat siswa. Coba lagi.</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Re-trigger the effect by nudging query through a no-op set.
                    setState({ kind: "loading" });
                    setQuery((q) => q);
                    // Force-fetch immediately — bypass debounce on retry.
                    const q = query.trim();
                    if (!q) {
                      setState({ kind: "idle" });
                      return;
                    }
                    fetch(
                      `/api/students?search=${encodeURIComponent(q)}&status=ACTIVE&pageSize=20`,
                    )
                      .then(async (r) => {
                        if (!r.ok) throw new Error(`HTTP ${r.status}`);
                        return r.json();
                      })
                      .then((json) => {
                        const list: Student[] = (json?.data ?? []).map(
                          (s: Student) => ({
                            id: s.id,
                            name: s.name,
                            nickname: s.nickname ?? null,
                            nis: s.nis ?? null,
                          }),
                        );
                        const total: number =
                          json?.pagination?.total ?? list.length;
                        setState({ kind: "ok", results: list, total });
                      })
                      .catch(() => setState({ kind: "error" }));
                  }}
                >
                  Coba lagi
                </Button>
              </div>
            )}
            {state.kind === "ok" && state.results.length === 0 && (
              <CommandEmpty>
                {`Tidak ada siswa cocok dengan "${query.trim()}". Periksa ejaan.`}
              </CommandEmpty>
            )}
            {state.kind === "ok" && state.results.length > 0 && (
              <>
                {state.results.map((s) => (
                  <CommandItem
                    key={s.id}
                    value={s.id}
                    onSelect={() => {
                      onSelect(s);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <span className="flex flex-col">
                      <span>
                        {s.name}
                        {s.nickname ? ` (${s.nickname})` : ""}
                      </span>
                      {s.nis && (
                        <span className="text-xs text-muted-foreground">
                          NIS {s.nis}
                        </span>
                      )}
                    </span>
                  </CommandItem>
                ))}
                {state.total > 20 && (
                  <div className="border-t px-3 py-2 text-center text-xs text-muted-foreground">
                    {`Menampilkan 20 dari ${state.total} hasil. Persempit pencarian.`}
                  </div>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
