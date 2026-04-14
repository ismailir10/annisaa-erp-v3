"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

type ChildInfo = {
  studentId: string;
  studentName: string;
  className: string | null;
};

export function ChildSelectorTabs({
  items,
  selectedChildId,
}: {
  items: ChildInfo[];
  selectedChildId: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (items.length <= 1) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 mb-4 -mx-1 px-1">
      {items.map((child) => {
        const isSelected = child.studentId === selectedChildId;
        const params = new URLSearchParams(searchParams.toString());
        params.set("child", child.studentId);

        return (
          <Link
            key={child.studentId}
            href={`${pathname}?${params.toString()}`}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium whitespace-nowrap transition-colors shrink-0",
              isSelected
                ? "bg-primary/10 border-primary/30 text-primary"
                : "bg-card border-border text-muted-foreground hover:border-primary/20"
            )}
          >
            <span className={cn(
              "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
              isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            )}>
              {child.studentName[0]}
            </span>
            <span>{child.studentName}</span>
            {child.className && (
              <span className="text-[10px] text-muted-foreground">({child.className})</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
