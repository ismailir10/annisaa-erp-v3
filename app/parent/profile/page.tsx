import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Mail, Phone } from "lucide-react";
import { getParentWithChildren } from "@/lib/parent-helpers";
import { LogoutButton } from "./logout-button";
import { PageHeader } from "@/components/portal/page-header";
import { SectionLabel } from "@/components/portal/section-label";

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]![0]!.toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export default async function ParentProfilePage() {
  // Vercel injects this on every deploy; undefined on a local dev server.
  const buildRef = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null;
  const session = await getSession();
  if (!session || session.role !== "GUARDIAN") redirect("/");

  const { parent, children } = await getParentWithChildren(session);
  if (!parent) redirect("/parent");

  // Email shown comes from session (the OAuth-verified address Anda use to
  // sign in). Falls back to the parent record's email if seed-imported.
  const displayEmail = session.email ?? parent.email ?? null;

  return (
    <div className="space-y-6 pb-4">
      {/* Back chevron + a real page title. This page previously rendered no
          heading at all — the only parent surface with no `h1`, which left the
          "Profil" row in the Lainnya sheet leading somewhere unnamed. */}
      <div className="flex items-center gap-1">
        <Link
          href="/parent"
          className="grid size-11 -ml-2 shrink-0 place-items-center rounded-md text-foreground transition-colors hover:bg-primary/10 active:bg-primary/20"
          aria-label="Kembali"
        >
          <ChevronLeft size={22} />
        </Link>
        <PageHeader title="Profil" className="mb-0 flex-1" />
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
        <SectionLabel>Kontak</SectionLabel>
        <div className="space-y-2">
          <ContactCard icon={Phone} primary={parent.phone ?? "—"} secondary="Nomor terdaftar" />
          <ContactCard icon={Mail} primary={displayEmail ?? "—"} secondary="Email terdaftar" />
        </div>
      </section>

      {/* Anak Anda */}
      {children.length > 0 ? (
        <section>
          <SectionLabel>Anak Anda</SectionLabel>
          <ul className="space-y-2">
            {children.map((c) => {
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
                        {c.studentName}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
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

      {/* Akun section deferred to next cycle — destination pages
          (Notifikasi prefs, Bantuan, Tentang aplikasi/privacy/syarat)
          do not exist yet. Better to ship without false promises. */}

      <LogoutButton />

      {/* The old literal read "v3.4.2" while package.json said 0.1.0 — a
          number nobody could act on. The deploy sha is the thing support
          actually asks for, and it is absent locally, where it is noise. */}
      <p className="pt-4 text-center text-xs text-muted-foreground/70">
        Talib · An Nisaa&apos; Sekolahku
        {buildRef ? <span className="ml-1">· {buildRef}</span> : null}
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
        <p className="mt-0.5 text-xs text-muted-foreground">{secondary}</p>
      </div>
    </div>
  );
}

