import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight, LineChart } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/portal/page-header";
import { getParentWithChildren } from "@/lib/parent-helpers";

export default async function ParentPerkembanganListPage() {
  const session = await getSession();
  if (!session || session.role !== "GUARDIAN") redirect("/");

  const { children } = await getParentWithChildren(session);

  if (children.length === 0) {
    return (
      <div>
        <PageHeader
          title="Perkembangan"
          subtitle="Catatan harian dan pekanan dari sekolah"
        />
        <EmptyState
          accent="warm"
          icon={LineChart}
          title="Belum ada anak terdaftar"
          description="Hubungi admin sekolah untuk menautkan akun Anda dengan data anak."
        />
      </div>
    );
  }

  // Single-kid → auto-redirect for the canonical "I just want to see my
  // kid's progress" flow per design §5.3.
  if (children.length === 1) {
    redirect(`/parent/perkembangan/${children[0].studentId}`);
  }

  return (
    <div>
      <PageHeader
        title="Perkembangan"
        subtitle="Pilih anak untuk melihat catatan"
      />
      <ul className="space-y-2" data-testid="perkembangan-children-list">
        {children.map((child) => (
          <li key={child.studentId}>
            <Link
              href={`/parent/perkembangan/${child.studentId}`}
              data-testid={`perkembangan-child-${child.studentId}`}
              className="block"
            >
              <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30 active:border-primary/40">
                <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <LineChart size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {child.studentName}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {[child.className, child.programName]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </p>
                </div>
                <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
