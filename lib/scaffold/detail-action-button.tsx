"use client";

// Client island for ScaffoldDetailPage workflow buttons. Confirm flow uses the
// shared `confirm-dialog` primitive from components/ui. Real wiring (audit +
// permission + toast) lands per-action in p2+ when entities define their own
// `defineAction({...})` calls — this island is the rendering host only.

import * as React from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import type { DetailActionDef } from "./entity";

export type DetailActionButtonProps<T> = {
  action: DetailActionDef<T>;
  row: T;
};

function mapButtonVariant(
  v: "default" | "destructive" | "warning" | undefined,
): "default" | "destructive" | "outline" {
  if (v === "destructive") return "destructive";
  if (v === "warning") return "outline";
  return "default";
}

export function DetailActionButton<T>({ action, row }: DetailActionButtonProps<T>) {
  const [isPending, startTransition] = React.useTransition();
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const run = () => {
    startTransition(async () => {
      try {
        await action.onClick(row);
      } finally {
        setConfirmOpen(false);
      }
    });
  };

  const handleClick = () => {
    if (action.confirm) {
      setConfirmOpen(true);
      return;
    }
    run();
  };

  return (
    <>
      <Button
        type="button"
        variant={mapButtonVariant(action.variant)}
        onClick={handleClick}
        disabled={isPending}
      >
        {action.label}
      </Button>
      {action.confirm && (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={action.confirm.title}
          description={action.confirm.description}
          confirmLabel={action.label}
          onConfirm={run}
          destructive={action.variant === "destructive"}
          loading={isPending}
        />
      )}
    </>
  );
}
