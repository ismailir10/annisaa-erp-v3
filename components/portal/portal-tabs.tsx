"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type PortalTab = {
  id: string;
  label: string;
  /** Secondary descriptor rendered inline after the primary label (e.g. "(TKIT A)") */
  secondary?: string;
  /** Optional badge count (e.g. unread / filter match count) */
  count?: number;
};

export type PortalTabsProps = {
  items: PortalTab[];
  activeId: string;
  onSelect: (id: string) => void;
  variant?: "pills" | "underline";
  ariaLabel?: string;
  className?: string;
};

/**
 * Horizontal scrollable tab bar primitive for parent + teacher portals.
 *
 * - Horizontal overflow with scrollbar hidden and edge fade mask
 * - Active tab auto-scrolls into view on mount and whenever `activeId` changes
 * - Full keyboard navigation (Arrow / Home / End) with roving tabindex
 * - Controlled only — parent owns `activeId`
 *
 * Shadcn's `Tabs` primitive handles panel switching, not overflow-scrolling
 * tab bars. This component is additive per the Portal Consistency Standard.
 */
export function PortalTabs({
  items,
  activeId,
  onSelect,
  variant = "pills",
  ariaLabel,
  className,
}: PortalTabsProps) {
  const tabRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());
  const [focusId, setFocusId] = useState<string>(activeId);

  // Keep internal focus pointer in sync with controlled activeId when it changes externally.
  useEffect(() => {
    setFocusId(activeId);
  }, [activeId]);

  // Auto-scroll active tab into view on mount + whenever activeId changes.
  useEffect(() => {
    const el = tabRefs.current.get(activeId);
    if (!el) return;
    el.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [activeId]);

  const setTabRef = useCallback(
    (id: string) => (node: HTMLButtonElement | null) => {
      if (node) tabRefs.current.set(id, node);
      else tabRefs.current.delete(id);
    },
    []
  );

  const focusTab = useCallback(
    (id: string) => {
      const el = tabRefs.current.get(id);
      if (el) el.focus();
      setFocusId(id);
      onSelect(id);
    },
    [onSelect]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, currentId: string) => {
      const idx = items.findIndex((t) => t.id === currentId);
      if (idx === -1) return;

      if (e.key === "ArrowRight") {
        e.preventDefault();
        const next = items[(idx + 1) % items.length];
        focusTab(next.id);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        const prev = items[(idx - 1 + items.length) % items.length];
        focusTab(prev.id);
      } else if (e.key === "Home") {
        e.preventDefault();
        focusTab(items[0].id);
      } else if (e.key === "End") {
        e.preventDefault();
        focusTab(items[items.length - 1].id);
      }
    },
    [items, focusTab]
  );

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "flex gap-2 overflow-x-auto pb-1",
        // hide scrollbar across browsers
        "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
        // edge fade so content hints at scrollability
        "[mask-image:linear-gradient(to_right,transparent_0,black_0.25rem,black_calc(100%-0.25rem),transparent_100%)]",
        className
      )}
    >
      {items.map((item) => {
        const active = item.id === activeId;
        const isTabStop = item.id === focusId;

        const baseClasses =
          "whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

        const variantClasses =
          variant === "pills"
            ? cn(
                "px-4 py-2 rounded-full",
                active
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )
            : cn(
                "px-3 py-2 border-b-2",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              );

        return (
          <button
            key={item.id}
            ref={setTabRef(item.id)}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={isTabStop ? 0 : -1}
            onClick={() => onSelect(item.id)}
            onKeyDown={(e) => handleKeyDown(e, item.id)}
            className={cn(baseClasses, variantClasses)}
          >
            <span>{item.label}</span>
            {item.secondary ? (
              <span className="ml-1 text-xs text-muted-foreground">
                {item.secondary}
              </span>
            ) : null}
            {item.count != null ? (
              <span
                className={cn(
                  "ml-2 inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs",
                  active
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-background text-foreground"
                )}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export default PortalTabs;
