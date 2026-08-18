import { cn } from "@/lib/utils";

/**
 * The small label above a group of cards ("Anak Anda", "Riwayat pembayaran").
 *
 * The parent portal had grown three of these — the uppercase eyebrow on most
 * pages, a `font-semibold text-base` sentence-case heading on the Perkembangan
 * detail, and the page `h1` itself. Three levels for one rank meant a reader
 * could not tell which headings were siblings. This is the one.
 *
 * Renders a `<p>` by default because most call sites label a list that already
 * carries its own `aria-label`. Pass `as="h2"` where the section is a real
 * document landmark and nothing else names it.
 */
export function SectionLabel({
  children,
  as: Tag = "p",
  className,
  ...props
}: {
  children: React.ReactNode;
  as?: "p" | "h2";
  className?: string;
} & React.HTMLAttributes<HTMLParagraphElement | HTMLHeadingElement>) {
  return (
    <Tag
      className={cn(
        "mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}

export default SectionLabel;
