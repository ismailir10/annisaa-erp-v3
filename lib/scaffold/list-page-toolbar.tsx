"use client";

// Cycle p2-scaffold-list-crud-parity (T2). Filter-row client island for
// `<ScaffoldListPage>`. Wraps the existing `<DataTableToolbar>` primitive +
// syncs the search input + view selector to URL query params via
// `useRouter().replace`. Search input is debounced 300ms inside the toolbar
// primitive.
//
// design-system reference: design-system.html admin list shell — search +
// status filter row above the table body. No new design tokens introduced.

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { DataTableToolbar } from "@/components/ui/data-table-toolbar";

export type ScaffoldListPageToolbarProps = {
  searchPlaceholder?: string;
  views?: ReadonlyArray<{ key: string; label: string }>;
};

export function ScaffoldListPageToolbar({
  searchPlaceholder = "Cari...",
  views,
}: ScaffoldListPageToolbarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentView = searchParams.get("view") ?? "";

  const updateParam = React.useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      // Reset to page 1 on filter change.
      next.delete("page");
      router.replace(`?${next.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const filters = React.useMemo(() => {
    if (!views || views.length <= 1) return undefined;
    return [
      {
        key: "view",
        label: "Tampilan",
        options: views.map((v) => ({ value: v.key, label: v.label })),
        value: currentView,
        onChange: (v: string) => updateParam("view", v),
      },
    ];
  }, [views, currentView, updateParam]);

  return (
    <DataTableToolbar
      searchPlaceholder={searchPlaceholder}
      onSearchChange={(s) => updateParam("q", s)}
      filters={filters}
    />
  );
}
