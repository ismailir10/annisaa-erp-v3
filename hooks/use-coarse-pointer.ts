import * as React from "react"

/**
 * True when the primary pointer is coarse (touch) rather than fine
 * (mouse/trackpad) — `(pointer: coarse)`. Used by `DatePicker` to switch
 * between a native `<input type="date">` (touch) and the Calendar popover
 * (mouse), per Assumption 3 in docs/cycles/2026-09-26-admin-ui-standard-c1.md.
 *
 * SSR-safe: defaults to `false` (the fine-pointer / desktop branch) and
 * corrects itself in an effect once `window.matchMedia` is available, same
 * shape as `hooks/use-mobile.ts`'s `useIsMobile`.
 */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = React.useState(false)

  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return

    const mql = window.matchMedia("(pointer: coarse)")
    const onChange = () => setCoarse(mql.matches)
    onChange()
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return coarse
}
