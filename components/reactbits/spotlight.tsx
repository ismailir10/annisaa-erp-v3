"use client"

// Adapted from React Bits — src/ts-tailwind/Components/SpotlightCard (DavidHDev/react-bits @ e1bbb696,
// MIT + Commons Clause). Reworked into a decorative layer: no re-render per pointermove, mouse only,
// brand-token colour. See docs/cycles/2026-09-30-reactbits-motion.md.

import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

/**
 * Decorative cursor-following spotlight, dropped inside any existing card.
 *
 * The PARENT element must be `relative isolate overflow-hidden` (callers add
 * those classes). `isolate` makes the `-z-10` layer paint above the parent's
 * background but beneath its content, so text contrast is unchanged.
 *
 * Mouse only (touch and pen are ignored). Pointer position is written straight
 * to CSS custom properties on the layer, so there is no React state and no
 * re-render per pointermove. Updates are coalesced into one rAF per frame.
 */
export function Spotlight({
  className,
  size = 280,
}: {
  className?: string
  size?: number
}) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const layer = ref.current
    const host = layer?.parentElement
    if (!layer || !host) return

    let frame: number | null = null
    let latest: PointerEvent | null = null

    const flush = () => {
      frame = null
      const e = latest
      latest = null
      if (!e) return
      const rect = host.getBoundingClientRect()
      layer.style.setProperty("--spot-x", `${e.clientX - rect.left}px`)
      layer.style.setProperty("--spot-y", `${e.clientY - rect.top}px`)
      layer.style.opacity = "1"
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return
      latest = e
      if (frame === null) frame = requestAnimationFrame(flush)
    }

    const onLeave = () => {
      latest = null
      layer.style.opacity = "0"
    }

    host.addEventListener("pointermove", onMove)
    host.addEventListener("pointerleave", onLeave)
    return () => {
      host.removeEventListener("pointermove", onMove)
      host.removeEventListener("pointerleave", onLeave)
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <span
      ref={ref}
      aria-hidden="true"
      data-slot="spotlight"
      className={cn(
        "pointer-events-none absolute inset-0 -z-10 rounded-[inherit] opacity-0 transition-opacity duration-200 ease-out",
        className,
      )}
      style={{
        background: `radial-gradient(${size}px circle at var(--spot-x, 50%) var(--spot-y, 50%), color-mix(in oklch, var(--primary) 10%, transparent), transparent 70%)`,
      }}
    />
  )
}
