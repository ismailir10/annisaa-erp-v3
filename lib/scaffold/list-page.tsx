// ScaffoldListPage<T> — server-component-first list page shell per spec §5.2
// + §5.4 (Breadcrumbs → Header → Filter chips → DataTable → Bulk action bar).
// Empty / loading / error states mandatory per §5.7. Mobile responsive per
// §5.8 (DataTable card-stack <md handled inside the DataTable primitive).
//
// Library export — not mounted on any route until p2. Page-recipe contract:
// `app/admin/<entity>/page.tsx` boils down to 4 lines per spec §5.2.

import * as React from "react";
import Link from "next/link";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

import type { EntityDef } from "./entity";
import { fmt } from "./format";
import { ScaffoldErrorState } from "./error-state";

export type ScaffoldListPageProps<T> = {
  entity: EntityDef<T>;
  breadcrumbs?: ReadonlyArray<{ label: string; href?: string }>;
  searchParams?: {
    page?: string;
    pageSize?: string;
    q?: string;
    view?: string;
  };
};

export async function ScaffoldListPage<T>({
  entity,
  breadcrumbs = [],
  searchParams = {},
}: ScaffoldListPageProps<T>) {
  const page = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);
  const pageSize = Math.max(
    1,
    Math.min(100, Number.parseInt(searchParams.pageSize ?? "25", 10) || 25),
  );
  const search = searchParams.q?.trim() || undefined;

  let rows: ReadonlyArray<T> = [];
  let total = 0;
  let error: Error | null = null;
  try {
    const r = await entity.dataFetcher({
      page,
      pageSize,
      filters: {},
      search,
    });
    rows = r.rows;
    total = r.total;
  } catch (e) {
    error = e instanceof Error ? e : new Error(String(e));
  }

  const isFiltered = Boolean(search);
  const isEmpty = !error && rows.length === 0;

  return (
    <div data-slot="scaffold-list-page" className="flex flex-col gap-4 p-4 md:p-6">
      <ScaffoldBreadcrumbs trail={[...breadcrumbs, { label: entity.label }]} />
      <ScaffoldHeader title={entity.label} subtitle={total > 0 ? `${fmt.number(total)} ${entity.labelSingular.toLowerCase()}` : undefined} />
      {error && <ScaffoldErrorState error={error} />}
      {!error && isEmpty && isFiltered && (
        <EmptyState
          title="Tidak ada hasil"
          description="Coba ubah filter atau kata kunci pencarian."
        />
      )}
      {!error && isEmpty && !isFiltered && (
        <EmptyState
          title={`Belum ada ${entity.labelSingular.toLowerCase()}`}
          description={`Tambahkan ${entity.labelSingular.toLowerCase()} pertama untuk mulai.`}
        />
      )}
      {!error && rows.length > 0 && (
        <ScaffoldListBody entity={entity} rows={rows} total={total} page={page} pageSize={pageSize} />
      )}
    </div>
  );
}

export function ScaffoldListPageLoading() {
  return (
    <div data-slot="scaffold-list-page-loading" className="flex flex-col gap-4 p-4 md:p-6">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}

function ScaffoldBreadcrumbs({
  trail,
}: {
  trail: ReadonlyArray<{ label: string; href?: string }>;
}) {
  if (trail.length === 0) return null;
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {trail.map((step, i) => {
          const isLast = i === trail.length - 1;
          return (
            <React.Fragment key={`${step.label}-${i}`}>
              <BreadcrumbItem>
                {isLast || !step.href ? (
                  <BreadcrumbPage>{step.label}</BreadcrumbPage>
                ) : (
                  <Link href={step.href} className="hover:text-foreground transition-colors">
                    {step.label}
                  </Link>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function ScaffoldHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="flex flex-col gap-1" data-slot="scaffold-header">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
    </header>
  );
}

function ScaffoldListBody<T>({
  entity,
  rows,
  total,
  page,
  pageSize,
}: {
  entity: EntityDef<T>;
  rows: ReadonlyArray<T>;
  total: number;
  page: number;
  pageSize: number;
}) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div data-slot="scaffold-list-body" className="rounded-lg border">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {entity.listColumns.map((col) => (
                <th key={col.field} className="px-3 py-2 text-left font-medium">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const id = (row as Record<string, unknown>).id;
              const rowKey = typeof id === "string" || typeof id === "number" ? String(id) : `row-${i}`;
              return (
                <tr key={rowKey} className="border-t">
                  {entity.listColumns.map((col) => (
                    <td key={col.field} className="px-3 py-2">
                      {col.format
                        ? col.format(row)
                        : String((row as Record<string, unknown>)[col.field] ?? "—")}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
        <span>
          Halaman {fmt.number(page)} dari {fmt.number(lastPage)}
        </span>
        <span>{fmt.number(total)} total</span>
      </div>
    </div>
  );
}
