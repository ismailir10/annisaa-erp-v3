"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PortalTabs, type PortalTab } from "@/components/portal/portal-tabs";

type ChildInfo = {
  studentId: string;
  studentName: string;
  className: string | null;
};

export function ChildSelectorTabs({
  items,
  selectedChildId,
  sticky = false,
}: {
  items: ChildInfo[];
  selectedChildId: string;
  /**
   * When true, pins the child switcher below `PortalHeader` so it stays
   * visible while inner-tab content scrolls. Use on child-detail routes
   * (invoices, attendance, reports) per design-system.html §14 Option C.
   */
  sticky?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (items.length <= 1) return null;

  const tabs: PortalTab[] = items.map((child) => {
    // Pill label = first name only. Frame 4/8/11 of cycle-4 prototype.
    // Full name + class would overflow at 375px and the class chip rendered
    // in a contrasting tone breaks the active-pill (teal-on-teal) palette.
    const firstName = child.studentName.trim().split(/\s+/)[0] ?? child.studentName;
    return {
      id: child.studentId,
      label: firstName,
    };
  });

  const handleSelect = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("child", id);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className={sticky ? "mb-4" : "mb-4 -mx-1 px-1"}>
      <PortalTabs
        items={tabs}
        activeId={selectedChildId}
        onSelect={handleSelect}
        variant="pills"
        ariaLabel="Pilih anak"
        sticky={sticky}
      />
    </div>
  );
}
