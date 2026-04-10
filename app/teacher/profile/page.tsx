import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, Mail, Phone, Building2, Briefcase, CreditCard } from "lucide-react";

export default async function TeacherProfilePage() {
  const session = await getSession();
  if (!session?.employeeId) redirect("/");

  const employee = await prisma.employee.findUnique({
    where: { id: session.employeeId },
    include: { campus: { select: { name: true } } },
  });

  if (!employee) redirect("/");

  const fields = [
    { icon: User, label: "Nama Lengkap", value: employee.formalName ?? employee.nama },
    { icon: Briefcase, label: "Jabatan", value: employee.jabatan },
    { icon: Building2, label: "Kampus", value: employee.campus.name },
    { icon: Mail, label: "Email", value: employee.email },
    { icon: Phone, label: "No. Handphone", value: employee.noHp ?? "—" },
    { icon: CreditCard, label: "No. Rekening", value: employee.bankAccountNo ? `${employee.bankName} ${employee.bankAccountNo}` : "—" },
  ];

  return (
    <div className="px-5 pt-6 pb-4">
      <h1 className="text-lg font-bold mb-4">Profil Saya</h1>

      {/* Avatar + Name */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <span className="text-primary text-xl font-bold">{employee.nama[0]}</span>
        </div>
        <div>
          <h2 className="text-base font-semibold">{employee.nama}</h2>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary" className="text-[10px] font-currency">{employee.kode}</Badge>
            <Badge variant="secondary" className="text-[10px] bg-status-present-subtle text-status-present-text">Aktif</Badge>
          </div>
        </div>
      </div>

      {/* Info Card */}
      <Card className="p-0 overflow-hidden">
        {fields.map((f, i) => {
          const Icon = f.icon;
          return (
            <div
              key={f.label}
              className={`flex items-center gap-3 px-4 py-3.5 ${i < fields.length - 1 ? "border-b border-border" : ""}`}
            >
              <Icon size={16} className="text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{f.label}</p>
                <p className="text-sm font-medium mt-0.5 truncate">{f.value}</p>
              </div>
            </div>
          );
        })}
      </Card>

      <p className="text-xs text-muted-foreground text-center mt-6">
        Hubungi admin untuk mengubah data profil
      </p>
    </div>
  );
}
