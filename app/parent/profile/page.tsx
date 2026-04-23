import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Bell, ChevronLeft, ChevronRight, HelpCircle, Info, Mail, Phone } from "lucide-react";
import { getParentWithChildren } from "@/lib/parent-helpers";
import { LogoutButton } from "./logout-button";

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]![0]!.toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export default async function ParentProfilePage() {
  const session = await getSession();
  if (!session || session.role !== "GUARDIAN") redirect("/");

  const { parent, children } = await getParentWithChildren(session);
  if (!parent) redirect("/parent");

  return (
    <div className="space-y-6 pb-4">
      {/* Nested-page header (back chevron) */}
      <div className="flex items-center">
        <Link
          href="/parent"
          className="grid size-11 -ml-2 place-items-center rounded-md text-foreground transition-colors hover:bg-primary/10 active:bg-primary/20"
          aria-label="Kembali"
        >
          <ChevronLeft size={22} />
        </Link>
      </div>

      {/* Identity surface */}
      <section className="flex flex-col items-center pt-2 pb-4">
        <div className="grid size-20 place-items-center rounded-full border border-primary/20 bg-primary/10 text-primary">
          <span className="text-xl font-bold">{initialsOf(parent.name)}</span>
        </div>
        <p className="mt-3 text-base font-semibold text-foreground">
          {parent.name}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Wali murid · {children.length} anak terdaftar
        </p>
      </section>

      {/* Kontak */}
      <section>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Kontak
        </p>
        <div className="space-y-2">
          <ContactCard icon={Phone} primary={parent.phone ?? "—"} secondary="Nomor terdaftar" />
          <ContactCard icon={Mail} primary={parent.email ?? "—"} secondary="Email terdaftar" />
        </div>
      </section>

      {/* Anak Anda */}
      {children.length > 0 ? (
        <section>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Anak Anda
          </p>
          <ul className="space-y-2">
            {children.map((c) => {
              const childLabel = c.studentName.split(" ").slice(0, 2).join(" ");
              const initials = initialsOf(c.studentName);
              return (
                <li key={c.studentId}>
                  <Link
                    href={`/parent/attendance?child=${c.studentId}`}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30 active:border-primary/40"
                  >
                    <div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary text-xs font-bold">
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">
                        {childLabel}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {c.className ?? "—"}
                        {c.programName ? ` · ${c.programName}` : ""}
                      </p>
                    </div>
                    <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* Akun */}
      <section>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Akun
        </p>
        <div className="space-y-2">
          <StaticCard
            icon={Bell}
            primary="Notifikasi"
            secondary="Pengaturan email & push"
          />
          <StaticCard
            icon={HelpCircle}
            primary="Bantuan"
            secondary="FAQ & hubungi sekolah"
          />
          <StaticCard
            icon={Info}
            primary="Tentang aplikasi"
            secondary="Kebijakan privasi & syarat"
          />
        </div>
      </section>

      <LogoutButton />

      <p className="pt-4 text-center text-[11px] text-muted-foreground/70">
        An Nisaa&apos; Sekolahku · v3.4.2
      </p>
    </div>
  );
}

type CardIconProps = {
  icon: typeof Phone;
  primary: string;
  secondary: string;
};

function ContactCard({ icon: Icon, primary, secondary }: CardIconProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground truncate">{primary}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{secondary}</p>
      </div>
    </div>
  );
}

function StaticCard({ icon: Icon, primary, secondary }: CardIconProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 opacity-90">
      <div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{primary}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{secondary}</p>
      </div>
    </div>
  );
}
