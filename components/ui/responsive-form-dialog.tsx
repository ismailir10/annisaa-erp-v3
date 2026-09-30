"use client";

import * as React from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

type Size = "sm" | "md" | "lg" | "xl" | "2xl";

// A shrinkable grid track bounds the viewport even when the popup only has
// max-height. Padding belongs inside the viewport so field rings stay visible.
const BODY_SCROLL_CLASS =
  "grid min-h-0 min-w-0 flex-1 grid-rows-[minmax(0,1fr)] [&>[data-slot=scroll-area-viewport]]:min-h-0 [&>[data-slot=scroll-area-viewport]]:min-w-0 [&>[data-slot=scroll-area-viewport]]:overscroll-contain";

const SIZE_CLASS: Record<Size, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-xl",
  "2xl": "sm:max-w-2xl",
};

export function ResponsiveFormDialog({
  open,
  onOpenChange,
  title,
  description,
  size = "lg",
  footer,
  children,
  contentClassName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  size?: Size;
  footer: React.ReactNode;
  children: React.ReactNode;
  contentClassName?: string;
}) {
  const isMobile = useIsMobile();
  // Freeze the breakpoint choice while the dialog is open so a viewport
  // change (orientation, devtools toggle) doesn't unmount the active tree
  // and reset form state. Re-evaluate only when closed.
  const [renderMobile, setRenderMobile] = React.useState(isMobile);
  React.useEffect(() => {
    if (!open) setRenderMobile(isMobile);
  }, [open, isMobile]);

  // CORE-12: these dialogs are opened by state from a plain button (no Trigger
  // element), so nothing hands focus back when they close and it fell to <body>
  // — keyboard users restarted from the top of the page. Remember what had
  // focus at the moment the dialog opens and put it back afterwards. The
  // opener is read during the render that opens the dialog: by the time any
  // effect runs the popup has already moved focus into itself.
  const returnFocusRef = React.useRef<HTMLElement | null>(null);
  const wasOpenRef = React.useRef(false);
  if (open && !wasOpenRef.current && typeof document !== "undefined") {
    const active = document.activeElement;
    returnFocusRef.current =
      active instanceof HTMLElement && active !== document.body ? active : null;
  }
  React.useLayoutEffect(() => {
    wasOpenRef.current = open;
    if (open) return;
    const target = returnFocusRef.current;
    returnFocusRef.current = null;
    if (!target) return;
    // The popup keeps focus while its exit transition runs and only drops it to
    // <body> once it unmounts — so wait for that instead of guessing a delay,
    // and never steal focus the user has already moved somewhere else.
    let id: number | undefined;
    let tries = 0;
    const restore = () => {
      const active = document.activeElement;
      if (!active || active === document.body) {
        if (target.isConnected) target.focus();
        return;
      }
      if (tries++ < 30) id = window.setTimeout(restore, 50);
    };
    id = window.setTimeout(restore, 0);
    return () => window.clearTimeout(id);
  }, [open]);

  if (renderMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className={cn("max-h-[90dvh] min-h-0 safe-area-bottom", contentClassName)}
        >
          <SheetHeader className="shrink-0">
            <SheetTitle>{title}</SheetTitle>
            {description ? <SheetDescription>{description}</SheetDescription> : null}
          </SheetHeader>
          <ScrollArea className={BODY_SCROLL_CLASS}>
            <div className="min-w-0 space-y-field px-4 py-2">{children}</div>
          </ScrollArea>
          {footer != null ? (
            <SheetFooter className="shrink-0 sm:justify-end">{footer}</SheetFooter>
          ) : null}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-h-[90dvh]", SIZE_CLASS[size], contentClassName)}>
        <DialogHeader className="shrink-0">
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {/* body is the only scrolling region — header/footer stay docked */}
        <ScrollArea className={BODY_SCROLL_CLASS}>
          <div className="min-w-0 space-y-field py-2 pl-1 pr-3">{children}</div>
        </ScrollArea>
        {/* Multi-step shells (billing-run wizard) render their own step
            actions and pass `footer={null}` — no empty docked bar. */}
        {footer != null ? <DialogFooter className="shrink-0">{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  );
}
