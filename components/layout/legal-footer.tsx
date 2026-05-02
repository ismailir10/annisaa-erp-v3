import Link from "next/link";

export function LegalFooter() {
  return (
    <footer className="mt-8 flex flex-col items-center gap-2 text-xs text-sidebar-foreground/70">
      <div className="flex items-center gap-3">
        <Link href="/legal/terms" className="hover:text-white hover:underline">
          Syarat &amp; Ketentuan
        </Link>
        <span aria-hidden>·</span>
        <Link href="/legal/privacy" className="hover:text-white hover:underline">
          Kebijakan Privasi
        </Link>
      </div>
      <div>© {new Date().getFullYear()} An Nisaa&apos; Sekolahku</div>
    </footer>
  );
}
