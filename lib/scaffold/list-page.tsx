// ScaffoldListPage<T> — server-component-first list page shell per spec §5.2
// + §5.4 (Breadcrumbs → Header (with Add CTA) → Filter chips → DataTable
// (with action column) → Bulk action bar deferred). Empty / loading / error
// states mandatory per §5.7. Mobile responsive per §5.8 (DataTable card-stack
// <md handled inside the DataTable primitive).
//
// Library export — page wrappers are 4 lines per spec §5.2.
//
// Cycle p2-scaffold-list-crud-parity (T2) wired the CRUD parity affordances:
//   • Add button (server-rendered Link in header) — gated on
//     `!entity.createDisabled && entity.formSections.length > 0`. Hidden for
//     entities whose creation lives off-scaffold (e.g. admission via /daftar).
//   • Filter row — `<ScaffoldListPageToolbar>` client island wraps the
//     existing `<DataTableToolbar>` primitive + syncs ?q= / ?view= URL params.
//   • Action column — `<ScaffoldListRow>` client island per row renders the
//     existing `<DataTableRowActions>` primitive + AlertDialog confirmation
//     for destructive + sonner toast on result.
//   • Row click → first View action's href (keyboard-accessible).
//   • Empty-state CTA — same Add button as a primary CTA in the cold-empty
//     state when create scope resolves.
//   • Total count surface — header subtitle reads "<n> <labelSingular>"
//     in both empty + populated branches.
//
// design-system reference: design-system.html admin list shell — header +
// filter row + action column spacing tokens unchanged from §1 + §6 spec.
//
// UI-side scope gating: this v1 renders all rowActions unconditionally; the
// server-action layer (`assertScope`) is the authoritative gate. UI-side
// hiding of unauthorized actions is a follow-up cycle (matches the
// detailActions pattern from `<ScaffoldDetailPage>`).

import * as React from "react";
import Link from "next/link";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus } from "lucide-react";

import type { EntityDef, RowActionDef } from "./entity";
import { fmt } from "./format";
import { ScaffoldErrorState } from "./error-state";
import { ScaffoldListPageToolbar } from "./list-page-toolbar";
import { ScaffoldListRow, type ResolvedRowAction } from "./list-page-row";

export type ScaffoldListPageProps<T> = {
  entity: EntityDef<T>;
  breadcrumbs?: ReadonlyArray<{ label: string; href?: string }>;
  searchParams?: {
    page?: string;
    pageSize?: string;
    q?: string;
    view?: string;
  };
  /** URL prefix for the entity's CRUD routes. Defaults to
   *  `<last-breadcrumb-href>/<entity.key>` when not provided. */
  basePath?: string;
};

export async function ScaffoldListPage<T>({
  entity,
  breadcrumbs = [],
  searchParams = {},
  basePath,
}: ScaffoldListPageProps<T>) {
  const page = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);
  const pageSize = Math.max(
    1,
    Math.min(100, Number.parseInt(searchParams.pageSize ?? "25", 10) || 25),
  );
  const search = searchParams.q?.trim() || undefined;

  const resolvedBase = basePath ?? deriveBasePath(breadcrumbs, entity.key);
  const createHref = `${resolvedBase}/new`;
  const showCreate = !entity.createDisabled && entity.formSections.length > 0;

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
  const labelLower = entity.labelSingular.toLowerCase();
  // Hide subtitle on error so the misleading "0 siswa" doesn't sit next to
  // the error state.
  const subtitle = error ? undefined : `${fmt.number(total)} ${labelLower}`;
  const showToolbar = !error;

  return (
    <div data-slot="scaffold-list-page" className="flex flex-col gap-4 p-4 md:p-6">
      <ScaffoldBreadcrumbs trail={[...breadcrumbs, { label: entity.label }]} />
      <ScaffoldHeader
        title={entity.label}
        subtitle={subtitle}
        action={
          showCreate ? (
            <Link
              href={createHref}
              data-slot="scaffold-list-add"
              className={buttonVariants({ size: "sm" })}
            >
              <Plus size={14} className="mr-1" />
              Tambah {entity.labelSingular}
            </Link>
          ) : null
        }
      />
      {showToolbar && (
        <ScaffoldListPageToolbar
          searchPlaceholder={`Cari ${labelLower}…`}
          views={entity.views}
        />
      )}
      {error && <ScaffoldErrorState error={error} />}
      {!error && isEmpty && isFiltered && (
        <EmptyState
          title="Tidak ada hasil"
          description="Coba ubah filter atau kata kunci pencarian."
        />
      )}
      {!error && isEmpty && !isFiltered && (
        <EmptyState
          title={`Belum ada ${labelLower}`}
          description={`Tambahkan ${labelLower} pertama untuk mulai.`}
          actionLabel={showCreate ? `Tambah ${entity.labelSingular} pertama` : undefined}
          actionHref={showCreate ? createHref : undefined}
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

function ScaffoldHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <header
      className="flex flex-wrap items-start justify-between gap-3"
      data-slot="scaffold-header"
    >
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
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
  const rowActions: ReadonlyArray<RowActionDef<T>> = entity.rowActions ?? [];
  const showActionsCol = rowActions.length > 0;

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
              {showActionsCol && (
                <th className="px-3 py-2 text-right font-medium w-32">Aksi</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const rowRecord = row as Record<string, unknown>;
              const id = rowRecord.id;
              const rowKey =
                typeof id === "string" || typeof id === "number"
                  ? String(id)
                  : `row-${i}`;
              const cells = entity.listColumns.map((col) =>
                col.format
                  ? col.format(row)
                  : String(rowRecord[col.field] ?? "—"),
              );
              const resolved: ReadonlyArray<ResolvedRowAction> = rowActions.map((a) => ({
                key: a.key,
                label: a.label,
                kind: a.kind,
                href: a.href ? a.href(row) : undefined,
                action: a.action,
                confirm: a.confirm,
              }));
              return (
                <ScaffoldListRow
                  key={rowKey}
                  rowId={rowKey}
                  cells={cells}
                  actions={resolved}
                />
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

function deriveBasePath(
  breadcrumbs: ReadonlyArray<{ label: string; href?: string }>,
  entityKey: string,
): string {
  const last = breadcrumbs.at(-1);
  if (last?.href) {
    return `${last.href.replace(/\/$/, "")}/${entityKey}`;
  }
  return `/${entityKey}`;
}
