import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  getParentInvoiceList,
  getParentOutstandingForStudents,
  getParentWithChildren,
  resolveSelectedChild,
} from "@/lib/parent-helpers";
import { ChildSelectorTabs } from "@/components/parent/child-selector-tabs";
import { InvoicesClient } from "./client";

export default async function ParentInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ child?: string }>;
}) {
  const session = await getSession();
  if (!session || session.role !== "GUARDIAN" || !session.tenantId) redirect("/");

  const { parent, children } = await getParentWithChildren(session);
  if (!parent || children.length === 0) redirect("/parent");

  const params = await searchParams;
  const selected = resolveSelectedChild(children, params.child);
  if (!selected) redirect("/parent");

  const kidIds = children.map((c) => c.studentId);

  // Two parallel reads:
  // - getParentInvoiceList: cached, single-child, includes PAID for "Riwayat".
  // - getParentOutstandingForStudents: uncached, household-wide, drives the
  //   empty-state copy so it agrees with /parent's Tagihan tile (UAT INV-01).
  const [data, household] = await Promise.all([
    getParentInvoiceList(parent.id, selected.studentId, session.tenantId),
    getParentOutstandingForStudents(kidIds, session.tenantId),
  ]);

  const childTabsData = children.map((c) => ({
    studentId: c.studentId,
    studentName: c.studentName,
    className: c.className,
  }));

  // Per-child summary derived from the SAME household.items so the banner
  // above the row list cannot disagree with /parent's Tagihan tile by
  // construction. Earliest dueDate is selected as nearestDue (string compare
  // is safe for YYYY-MM-DD).
  const selectedItems = household.items.filter((i) => i.studentId === selected.studentId);
  const selectedChildSummary = {
    count: selectedItems.length,
    total: selectedItems.reduce((s, i) => s + i.remaining, 0),
    nearestDue: selectedItems.reduce<string | null>(
      (acc, i) => (acc === null || i.dueDate < acc ? i.dueDate : acc),
      null,
    ),
  };

  // Children whose outstanding count > 0, excluding the selected one — used by
  // the "Lunas untuk X · N untuk anak lain" branch of the empty state.
  const otherChildrenWithOutstanding = children
    .filter((c) => c.studentId !== selected.studentId)
    .map((c) => ({
      studentId: c.studentId,
      studentName: c.studentName,
      count: household.items.filter((i) => i.studentId === c.studentId).length,
    }))
    .filter((c) => c.count > 0);

  return (
    <div>
      <ChildSelectorTabs
        items={childTabsData}
        selectedChildId={selected.studentId}
        sticky
      />
      <InvoicesClient
        data={data}
        selectedStudentName={selected.studentName}
        selectedChildSummary={selectedChildSummary}
        otherChildrenWithOutstanding={otherChildrenWithOutstanding}
      />
    </div>
  );
}
