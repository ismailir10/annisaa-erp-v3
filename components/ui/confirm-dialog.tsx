"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

/**
 * Branded confirmation dialog — replaces window.confirm().
 * Usage:
 *   const [confirmOpen, setConfirmOpen] = useState(false);
 *   <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen}
 *     title="Hapus karyawan?" description="Tindakan ini tidak bisa dibatalkan."
 *     onConfirm={handleDelete} destructive />
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Konfirmasi",
  cancelLabel = "Batal",
  onConfirm,
  destructive = false,
  loading = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  destructive?: boolean;
  loading?: boolean;
}) {
  const [isLoading, setIsLoading] = useState(false);

  async function handleConfirm() {
    setIsLoading(true);
    try {
      await onConfirm();
    } finally {
      setIsLoading(false);
      onOpenChange(false);
    }
  }

  const busy = loading || isLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <DialogClose>
            <Button variant="outline" disabled={busy}>{cancelLabel}</Button>
          </DialogClose>
          <Button
            onClick={handleConfirm}
            disabled={busy}
            className={destructive ? "bg-destructive hover:bg-destructive/90" : ""}
          >
            {busy ? "Memproses..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
