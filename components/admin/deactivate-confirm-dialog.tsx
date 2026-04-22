"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * Standardized confirm dialog for admin "terminal action" flows
 * (deactivate / void / cancel / delete). Wraps the generic
 * ConfirmDialog with Indonesian copy and the correct reversible-vs-
 * destructive messaging per action, so every admin page using the
 * same action phrases identically.
 */

type Action = "deactivate" | "void" | "cancel" | "delete";

const TITLE_VERB: Record<Action, string> = {
  deactivate: "Nonaktifkan",
  void: "Batalkan",
  cancel: "Batalkan",
  delete: "Hapus",
};

const DESCRIPTION: Record<Action, string> = {
  deactivate: "Data tidak akan dihapus dan dapat diaktifkan kembali.",
  void: "Tindakan ini tidak dapat dibatalkan.",
  cancel: "Tindakan ini tidak dapat dibatalkan.",
  delete: "Tindakan ini tidak dapat dibatalkan.",
};

const CONFIRM_LABEL: Record<Action, string> = {
  deactivate: "Nonaktifkan",
  void: "Ya, Batalkan",
  cancel: "Ya, Batalkan",
  delete: "Hapus",
};

const IS_DESTRUCTIVE: Record<Action, boolean> = {
  deactivate: false,
  void: true,
  cancel: true,
  delete: true,
};

export function DeactivateConfirmDialog({
  open,
  onOpenChange,
  entityName,
  action = "deactivate",
  onConfirm,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityName: string;
  action?: Action;
  onConfirm: () => void | Promise<void>;
  pending?: boolean;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${TITLE_VERB[action]} "${entityName}"?`}
      description={DESCRIPTION[action]}
      confirmLabel={CONFIRM_LABEL[action]}
      onConfirm={onConfirm}
      destructive={IS_DESTRUCTIVE[action]}
      loading={pending}
    />
  );
}
