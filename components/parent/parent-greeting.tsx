import { cn } from "@/lib/utils";

/**
 * ParentGreeting — greeting block for the parent home with an Islamic geometric
 * accent motif (Principle 7, voice.md Islamic courtesy layer). The motif is a
 * 4×4 rub-el-hizb dot-lattice rendered inline at `var(--motif-opacity)` (3%)
 * behind the Assalamu'alaikum heading. Pointer-events: none; aria-hidden.
 *
 * Cross-checked: `.claude/standards/design-system.html` §14 Page Recipes +
 * §17 Voice; `.claude/standards/portal.md` §Household Overview.
 *
 * Typography ramp: `text-display font-bold tracking-tight text-foreground` on
 * the greeting (design-system.html §3 scale) — subtitle stays `text-sm` muted.
 */
export type ParentGreetingProps = {
  title: string;
  subtitle?: string;
  className?: string;
};

export function ParentGreeting({ title, subtitle, className }: ParentGreetingProps) {
  return (
    <header className={cn("relative mb-6 overflow-hidden", className)}>
      {/* Islamic geometric motif — 4×4 dot-lattice with 8-pointed star overlay.
          Inherits text-primary currentColor via the parent's `text-primary` wrap
          and sits behind the text at `--motif-opacity` (3%). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 w-40 text-primary"
        style={{ opacity: "var(--motif-opacity)" }}
      >
        <svg
          viewBox="0 0 120 120"
          fill="currentColor"
          className="h-full w-full"
          preserveAspectRatio="xMidYMid meet"
        >
          <g>
            <circle cx="15" cy="15" r="2.5" />
            <circle cx="45" cy="15" r="2.5" />
            <circle cx="75" cy="15" r="2.5" />
            <circle cx="105" cy="15" r="2.5" />
            <circle cx="15" cy="45" r="2.5" />
            <circle cx="45" cy="45" r="2.5" />
            <circle cx="75" cy="45" r="2.5" />
            <circle cx="105" cy="45" r="2.5" />
            <circle cx="15" cy="75" r="2.5" />
            <circle cx="45" cy="75" r="2.5" />
            <circle cx="75" cy="75" r="2.5" />
            <circle cx="105" cy="75" r="2.5" />
            <circle cx="15" cy="105" r="2.5" />
            <circle cx="45" cy="105" r="2.5" />
            <circle cx="75" cy="105" r="2.5" />
            <circle cx="105" cy="105" r="2.5" />
          </g>
          <g fill="none" stroke="currentColor" strokeWidth="1">
            <path d="M60 20 L85 45 L60 70 L35 45 Z" />
            <path d="M42 27 L78 27 L78 63 L42 63 Z" />
          </g>
        </svg>
      </div>
      <div className="relative flex-1 min-w-0">
        <h1 className="text-display font-bold tracking-tight text-foreground">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
    </header>
  );
}

export default ParentGreeting;
