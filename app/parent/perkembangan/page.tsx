import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight, LineChart } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/portal/page-header";
import { Card } from "@/components/ui/card";
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
          subtitle="Catatan harian + pekanan dari sekolah"
        />
        <EmptyState
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
              <Card className="flex items-center gap-3 p-card hover:border-primary/30 transition-colors">
                <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <LineChart className="size-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">
                    {child.studentName}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {[child.className, child.programName]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </p>
                </div>
                <ChevronRight
                  size={16}
                  className="text-muted-foreground shrink-0"
                />
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
