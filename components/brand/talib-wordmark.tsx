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
  className,
}: {
  size?: Size;
  showSublabel?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex flex-col leading-none", sizeClass[size], className)}>
      <span className="font-semibold tracking-tight">Talib</span>
      {showSublabel && (
        <span className={cn("font-normal text-muted-foreground", sublabelClass[size])}>
          by An Nisaa&apos; Sekolahku
        </span>
      )}
    </span>
  );
}
