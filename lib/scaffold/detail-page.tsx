// ScaffoldDetailPage<T> — server-component-first detail page shell per spec
// §5.2 + §5.4 (Breadcrumbs → Header (avatar + status badge + workflow
// actions) → Tabs). Empty / loading / error states per §5.7.
//
// Workflow action buttons are client islands (DetailActionButton) — the
// shell stays on the server. Each entity defines its own tab keys per
// `EntityDef.detailTabs[]` (spec §5.4 cites Ringkasan/Wali/Riwayat/
// Lampiran/Aktivitas as the canonical Student-domain set).

import * as React from "react";
import Link from "next/link";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

import type { EntityDef } from "./entity";
import { ScaffoldErrorState } from "./error-state";
import { DetailActionButton } from "./detail-action-button";

export type ScaffoldDetailPageProps<T> = {
  entity: EntityDef<T>;
  /** Caller-provided fetcher for the single row (id resolution lives in the route). */
  fetchRow: () => Promise<T | null>;
  breadcrumbs?: ReadonlyArray<{ label: string; href?: string }>;
  /** Pull display label (e.g. student name) — defaults to a generic title. */
  rowLabel?: (row: T) => string;
  /** Optional status pill (e.g. "Aktif" / "Lulus"). */
  rowStatus?: (row: T) => { label: string; tone?: "success" | "warning" | "destructive" | "info" | "muted" } | null;
};

export async function ScaffoldDetailPage<T>({
  entity,
  fetchRow,
  breadcrumbs = [],
  rowLabel,
  rowStatus,
}: ScaffoldDetailPageProps<T>) {
  let row: T | null = null;
  let error: Error | null = null;
  try {
    row = await fetchRow();
  } catch (e) {
    error = e instanceof Error ? e : new Error(String(e));
  }

  if (error) {
    return (
      <div data-slot="scaffold-detail-page" className="p-4 md:p-6">
        <ScaffoldErrorState error={error} />
      </div>
    );
  }

  if (!row) {
    return (
      <div data-slot="scaffold-detail-page-not-found" className="p-4 md:p-6">
        <ScaffoldErrorState
          error={new Error("Data tidak ditemukan atau telah dihapus.")}
          title="Tidak ditemukan"
        />
      </div>
    );
  }

  const title = rowLabel ? rowLabel(row) : entity.labelSingular;
  const status = rowStatus ? rowStatus(row) : null;
  const trail = [...breadcrumbs, { label: entity.label }, { label: title }];

  return (
    <div data-slot="scaffold-detail-page" className="flex flex-col gap-4 p-4 md:p-6">
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
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {status && (
            <span
              data-slot="scaffold-detail-status"
              data-tone={status.tone ?? "muted"}
              className="rounded-full px-2.5 py-0.5 text-xs font-medium bg-muted text-muted-foreground"
            >
              {status.label}
            </span>
          )}
        </div>
        {entity.detailActions.length > 0 && (
          <div className="flex items-center gap-2">
            {entity.detailActions.map((action) => (
              <DetailActionButton key={action.key} action={action} row={row} />
            ))}
          </div>
        )}
      </header>
      {entity.detailTabs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada tab terdaftar untuk entitas ini.</p>
      ) : (
        <Tabs defaultValue={entity.detailTabs[0]?.key}>
          <TabsList>
            {entity.detailTabs.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {entity.detailTabs.map((tab) => (
            <TabsContent key={tab.key} value={tab.key}>
              {tab.render(row)}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}

export function ScaffoldDetailPageLoading() {
  return (
    <div data-slot="scaffold-detail-page-loading" className="flex flex-col gap-4 p-4 md:p-6">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
