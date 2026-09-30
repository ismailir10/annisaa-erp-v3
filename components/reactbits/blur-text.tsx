// Adapted from React Bits — src/ts-tailwind/TextAnimations/BlurText (DavidHDev/react-bits @ e1bbb696,
// MIT + Commons Clause). Ported to CSS keyframes: server-rendered, runs before hydration, and static
// under prefers-reduced-motion. See docs/cycles/2026-09-30-reactbits-motion.md.
import { Fragment } from "react";

type BlurTextProps = {
  text: string;
  as?: "h1" | "h2" | "h3" | "p" | "span";
  className?: string;
  /** ms between each word's start. Default 90. */
  stagger?: number;
  /** ms before the first word starts. Default 0. */
  delay?: number;
};

/**
 * Per-word blur-to-sharp reveal (fade in, small rise, staggered), in pure CSS.
 *
 * The text is rendered twice on purpose: a single `sr-only` text node gives assistive tech the
 * whole sentence (and lets `getByText` / heading-name queries match it), while the `aria-hidden`
 * per-word spans carry the visuals. Words are `inline-block` separated by real spaces (not
 * `&nbsp;`, not flex) so natural wrapping and `text-balance` on the Tag keep working.
 *
 * The animation only applies under `motion-safe:`, so reduced-motion users see static text.
 */
export function BlurText({ text, as: Tag = "p", className, stagger = 90, delay = 0 }: BlurTextProps) {
  const words = text.split(/\s+/).filter(Boolean);

  return (
    <Tag className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((word, i) => (
          <Fragment key={i}>
            <span
              className="inline-block motion-safe:animate-blur-in"
              style={{ animationDelay: `${delay + i * stagger}ms` }}
            >
              {word}
            </span>
            {i < words.length - 1 ? " " : null}
          </Fragment>
        ))}
      </span>
    </Tag>
  );
}
