"use client";

import { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

/**
 * Anchored, collapsible section for the Admin Detail "dossier" layout — one
 * long scroll of sections instead of tabs, so nothing about the entity is
 * hidden behind a click the admin has to know to make.
 *
 * Open state is **controlled by the page**, not held here. The anchor nav needs
 * to expand a collapsed section before scrolling to it; that is only possible
 * if one owner holds the map of section id → open.
 *
 * Entity-agnostic on purpose — the wali/household view is expected to reuse it.
 */

export type DossierSectionDef = { id: string; label: string };

export function DossierSection({
  id,
  label,
  badge,
  actions,
  open,
  onOpenChange,
  children,
}: {
  id: string;
  label: string;
  /** Glanceable summary shown in the collapsed header, e.g. "2 wali". */
  badge?: ReactNode;
  /** Rendered outside the trigger — must not be a nested interactive element. */
  actions?: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const contentId = `${id}-content`;
  return (
    // scroll-mt clears the sticky anchor nav so a jumped-to heading is not
    // parked underneath it.
    <Card id={id} className="mb-3 scroll-mt-28 p-0">
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <div className="flex items-center justify-between gap-2 px-card py-3">
          <CollapsibleTrigger
            aria-controls={contentId}
            className="group flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <ChevronDown
              size={15}
              aria-hidden="true"
              className={cn(
                "shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
                !open && "-rotate-90",
              )}
            />
            <h2 className="truncate text-sm font-semibold text-foreground">{label}</h2>
            {badge}
          </CollapsibleTrigger>
          {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
        </div>
        <CollapsibleContent id={contentId}>
          <div className="border-t px-card py-4">{children}</div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

/**
 * Sticky in-page nav over the sections. Clicking expands the target (a
 * collapsed section cannot be scrolled to meaningfully) and then scrolls.
 *
 * Horizontally scrollable on mobile rather than wrapping to three rows.
 */
export function DossierNav({
  sections,
  onJump,
}: {
  sections: DossierSectionDef[];
  onJump: (id: string) => void;
}) {
  return (
    <nav
      aria-label="Bagian halaman"
      className="sticky top-0 z-10 mb-3 overflow-x-auto rounded-lg border bg-card/95 p-1.5 backdrop-blur supports-[backdrop-filter]:bg-card/80"
    >
      <ul className="flex min-w-max items-center gap-1">
        {sections.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onJump(s.id)}
              className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-small text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {s.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
