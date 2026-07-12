import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg";

const sizeClass: Record<Size, string> = {
  sm: "text-sm",
  md: "text-lg",
  lg: "text-2xl",
};

const sublabelClass: Record<Size, string> = {
  sm: "text-[10px]",
  md: "text-xs",
  lg: "text-sm",
};

export function TalibWordmark({
  size = "md",
  showSublabel = true,
  tone = "default",
  className,
}: {
  size?: Size;
  showSublabel?: boolean;
  /** "onDark": white text for dark surfaces (login card, sidebar). */
  tone?: "default" | "onDark";
  className?: string;
}) {
  const onDark = tone === "onDark";
  return (
    <span
      className={cn(
        "inline-flex flex-col leading-none",
        sizeClass[size],
        onDark ? "text-white" : "text-foreground",
        className,
      )}
    >
      <span className="font-semibold tracking-tight">Talib</span>
      {showSublabel && (
        <span
          className={cn(
            "font-normal",
            onDark ? "text-white/70" : "text-muted-foreground",
            sublabelClass[size],
          )}
        >
          by An Nisaa&apos; Sekolahku
        </span>
      )}
    </span>
  );
}
