import Link from "next/link";

import { cn } from "@/lib/utils";

export function LegalFooter({
  /** "onDark": muted teal for the demo-mode dark shell (unchanged default).
   *  "onLight": the Google-only sign-in screen, which sits on --card. */
  tone = "onDark",
  className,
}: {
  tone?: "onDark" | "onLight";
  className?: string;
}) {
  const onDark = tone === "onDark";
  return (
    <footer
      className={cn(
        "mt-8 flex flex-col items-center gap-2 text-xs",
        onDark ? "text-sidebar-foreground/70" : "text-muted-foreground",
        className,
      )}
    >
      <div className="flex items-center gap-1">
        <Link
          href="/legal/terms"
          className={cn(
            // px/py give the link a >=24px hit area (WCAG 2.5.8) without
            // changing how the row reads.
            "rounded-md px-2 py-1.5 hover:underline",
            onDark ? "hover:text-white" : "hover:text-primary-text",
          )}
        >
          Syarat &amp; Ketentuan
        </Link>
        <span aria-hidden>·</span>
        <Link
          href="/legal/privacy"
          className={cn(
            "rounded-md px-2 py-1.5 hover:underline",
            onDark ? "hover:text-white" : "hover:text-primary-text",
          )}
        >
          Kebijakan Privasi
        </Link>
      </div>
      <div>© {new Date().getFullYear()} An Nisaa&apos; Sekolahku</div>
    </footer>
  );
}
