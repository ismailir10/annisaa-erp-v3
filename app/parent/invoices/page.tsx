import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getParentWithChildren, resolveSelectedChild, getParentInvoiceList } from "@/lib/parent-helpers";
import { ChildSelectorTabs } from "@/components/parent/child-selector-tabs";
import { InvoicesClient } from "./client";

export default async function ParentInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ child?: string }>;
}) {
  const session = await getSession();
  if (!session || session.role !== "GUARDIAN") redirect("/");

  const { parent, children } = await getParentWithChildren(session);
  if (!parent || children.length === 0) redirect("/parent");

  const params = await searchParams;
  const selected = resolveSelectedChild(children, params.child);
  if (!selected) redirect("/parent");

  // Cached query — key scoped to [parentId, studentId, tenantId].
  // Warm reloads hit cache; cold nav triggers one scalar-only Prisma query.
  const data = await getParentInvoiceList(parent.id, selected.studentId, session.tenantId!);

  const childTabsData = children.map((c) => ({
    studentId: c.studentId,
    studentName: c.studentName,
    className: c.className,
  }));

  return (
    <div>
      <ChildSelectorTabs
        items={childTabsData}
        selectedChildId={selected.studentId}
        sticky
      />
      <InvoicesClient data={data} />
    </div>
  );
}
