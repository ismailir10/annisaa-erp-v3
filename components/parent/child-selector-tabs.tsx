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
}: {
  items: ChildInfo[];
  selectedChildId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (items.length <= 1) return null;

  const tabs: PortalTab[] = items.map((child) => ({
    id: child.studentId,
    label: child.studentName,
    secondary: child.className ? `(${child.className})` : undefined,
  }));

  const handleSelect = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("child", id);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="mb-4 -mx-1 px-1">
      <PortalTabs
        items={tabs}
        activeId={selectedChildId}
        onSelect={handleSelect}
        variant="pills"
        ariaLabel="Pilih anak"
      />
    </div>
  );
}
