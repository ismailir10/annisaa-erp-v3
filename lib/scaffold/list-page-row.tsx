"use client";

// Cycle p2-scaffold-list-crud-parity (T2). Per-row client island for
// `<ScaffoldListPage>`. Renders one `<tr>` with:
//   • cells (pre-formatted by the server)
//   • row-click → navigates to the View action's href (keyboard-accessible:
//     Enter / Space on focused row triggers nav)
//   • action column (`<DataTableRowActions>` from components/ui) — buttons
//     stop event propagation so the action click does not double-fire row nav
//   • destructive actions wrap in `<AlertDialog>` confirmation; on confirm,
//     invokes the server action via `useTransition` + surfaces sonner toast
//     on success / failure
//
// Server actions are passed in by reference (each is "use server"-tagged,
// so Next.js bundles them as RPC stubs across the server→client boundary).
// `href` resolution happens server-side per row before passing here.
//
// design-system reference: design-system.html admin list shell — action
// column (Lihat / Edit / Nonaktifkan dropdown) + standard hover/focus states.

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DataTableRowActions } from "@/components/ui/data-table-row-actions";

import type { RowActionKind } from "./entity";

/** Per-row, per-action serializable shape passed from server → client.
 *  href is precomputed (server evaluated `action.href(row)`); `action` is a
 *  server-action function reference. ⚠ The function MUST be a "use server"
 *  export — Next bundles those as RPC stubs that cross the server→client
 *  boundary as serialized references. A plain closure passed here will
 *  trigger a runtime serialization crash ("Functions cannot be passed
 *  directly to Client Components..."). All entity registries wire row
 *  actions to existing soft-delete + state-machine action exports which
 *  carry "use server" — see lib/{students,guardians,households}/actions/
 *  soft-delete.ts and lib/admission/transitions/withdraw.ts. */
export type ResolvedRowAction = {
  key: string;
  label: string;
  kind: RowActionKind;
  href?: string;
  action?: (id: string) => Promise<{ ok: true; data?: unknown } | { ok: false; error: string }>;
  confirm?: { title: string; description: string; confirmLabel: string };
};

export type ScaffoldListRowProps = {
  rowId: string;
  /** Pre-formatted cell strings (server evaluated `col.format?.(row)` —
   *  narrowed to `string` to keep the server→client boundary serialize-safe;
   *  do NOT widen to ReactNode without a corresponding cells-formatter
   *  contract update. */
  cells: ReadonlyArray<string>;
  actions: ReadonlyArray<ResolvedRowAction>;
};

export function ScaffoldListRow({ rowId, cells, actions }: ScaffoldListRowProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [pendingDestructive, setPendingDestructive] = React.useState<ResolvedRowAction | null>(null);

  const viewAction = actions.find((a) => a.kind === "view");
  const editAction = actions.find((a) => a.kind === "edit");
  const destructiveActions = actions.filter((a) => a.kind === "destructive");
  const viewHref = viewAction?.href;

  const handleRowClick = React.useCallback(() => {
    if (viewHref) router.push(viewHref);
  }, [router, viewHref]);

  const handleRowKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLTableRowElement>) => {
      if (!viewHref) return;
      // Trigger nav on Enter only — Space is reserved for in-cell controls.
      if (e.key === "Enter" && e.target === e.currentTarget) {
        e.preventDefault();
        router.push(viewHref);
      }
    },
    [router, viewHref],
  );

  const runAction = React.useCallback(
    (action: ResolvedRowAction) => {
      if (!action.action) return;
      startTransition(async () => {
        try {
          const result = await action.action!(rowId);
          if (result.ok) {
            toast.success(`${action.label} berhasil.`);
            router.refresh();
          } else {
            toast.error(`${action.label} gagal: ${result.error}`);
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          toast.error(`${action.label} gagal: ${msg}`);
        }
      });
    },
    [rowId, router],
  );

  return (
    <>
      <tr
        data-slot="scaffold-list-row"
        data-clickable={viewHref ? "true" : undefined}
        onClick={viewHref ? handleRowClick : undefined}
        onKeyDown={viewHref ? handleRowKeyDown : undefined}
        tabIndex={viewHref ? 0 : undefined}
        aria-label={viewHref ? "Buka detail" : undefined}
        className={`border-t ${viewHref ? "cursor-pointer hover:bg-muted/40 focus:bg-muted/40 focus:outline-none" : ""}`}
      >
        {cells.map((cell, i) => (
          <td key={i} className="px-3 py-2 align-middle">
            {cell}
          </td>
        ))}
        {actions.length > 0 && (
          <td
            className="px-3 py-2 align-middle text-right"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <DataTableRowActions
              onView={viewAction ? () => router.push(viewAction.href!) : undefined}
              onEdit={editAction ? () => router.push(editAction.href!) : undefined}
              extraActions={destructiveActions.map((a) => ({
                label: a.label,
                onClick: () => {
                  if (a.confirm) setPendingDestructive(a);
                  else runAction(a);
                },
                destructive: true,
              }))}
            />
          </td>
        )}
      </tr>
      <AlertDialog
        open={Boolean(pendingDestructive)}
        onOpenChange={(open) => !open && setPendingDestructive(null)}
      >
        <AlertDialogContent>
          {pendingDestructive?.confirm && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{pendingDestructive.confirm.title}</AlertDialogTitle>
                <AlertDialogDescription>
                  {pendingDestructive.confirm.description}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isPending}>Batal</AlertDialogCancel>
                <AlertDialogAction
                  disabled={isPending || pendingDestructive === null}
                  onClick={() => {
                    if (isPending) return;
                    const a = pendingDestructive;
                    setPendingDestructive(null);
                    if (a) runAction(a);
                  }}
                >
                  {pendingDestructive.confirm.confirmLabel}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
