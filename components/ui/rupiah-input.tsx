"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"

const MAX_SAFE = Number.MAX_SAFE_INTEGER

function digitsOnly(raw: string): string {
  return raw.replace(/[^0-9]/g, "")
}

/** Drops leading zeros ("007" → "7") but keeps a lone "0". */
function stripLeadingZeros(digits: string): string {
  const stripped = digits.replace(/^0+(?=\d)/, "")
  return stripped || (digits ? "0" : "")
}

function groupThousands(digits: string): string {
  if (!digits) return ""
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
}

function toDisplay(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return ""
  return groupThousands(String(Math.trunc(Math.abs(value))))
}

/** Count of digit characters at/after `caret` in `str`. */
function digitsFromCaretToEnd(str: string, caret: number): number {
  let count = 0
  for (let i = caret; i < str.length; i++) {
    if (/\d/.test(str[i]!)) count++
  }
  return count
}

/** The index in `str` that leaves exactly `digitsFromEnd` digits after it. */
function caretForDigitsFromEnd(str: string, digitsFromEnd: number): number {
  if (digitsFromEnd <= 0) return str.length
  let seen = 0
  for (let i = str.length - 1; i >= 0; i--) {
    if (/\d/.test(str[i]!)) {
      seen++
      if (seen === digitsFromEnd) return i
    }
  }
  return 0
}

export interface RupiahInputProps
  extends Omit<
    React.ComponentProps<"input">,
    "value" | "onChange" | "type" | "inputMode"
  > {
  value: number | null
  onChange: (value: number | null) => void
}

/**
 * Money input with a muted "Rp" adornment, id-ID thousands separators while
 * typing, and an integer (or `null` when empty) emitted to `onChange`.
 * Negative numbers are not supported — the field is for amounts, and every
 * caller (fees, keringanan, invoices, salary) treats a negative as invalid.
 */
export function RupiahInput({
  value,
  onChange,
  id,
  name,
  disabled,
  placeholder,
  className,
  required,
  onBlur,
  ...rest
}: RupiahInputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [display, setDisplay] = React.useState(() => toDisplay(value))
  // Tracks the last value WE emitted, so an external reset (a different
  // field recomputing this one, a form reset) resyncs the display, but our
  // own onChange round-trip does not — which would otherwise fight the
  // caret while the user is mid-keystroke.
  const lastEmitted = React.useRef(value)

  React.useEffect(() => {
    if (value !== lastEmitted.current) {
      lastEmitted.current = value
      setDisplay(toDisplay(value))
    }
  }, [value])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    const caret = e.target.selectionStart ?? raw.length
    const digitsFromEnd = digitsFromCaretToEnd(raw, caret)

    let digits = stripLeadingZeros(digitsOnly(raw))
    if (digits && Number(digits) > MAX_SAFE) {
      digits = String(MAX_SAFE)
    }
    const nextDisplay = groupThousands(digits)
    const nextValue = digits ? Number(digits) : null

    setDisplay(nextDisplay)
    lastEmitted.current = nextValue
    onChange(nextValue)

    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el || document.activeElement !== el) return
      const pos = caretForDigitsFromEnd(nextDisplay, digitsFromEnd)
      el.setSelectionRange(pos, pos)
    })
  }

  return (
    <InputGroup
      className={cn("w-full", className)}
      data-disabled={disabled || undefined}
    >
      <InputGroupAddon className="pointer-events-none text-muted-foreground select-none">
        Rp
      </InputGroupAddon>
      <InputGroupInput
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        required={required}
        placeholder={placeholder ?? "0"}
        value={display}
        onChange={handleChange}
        onBlur={onBlur}
        className="font-currency text-right tabular-nums"
        {...rest}
      />
    </InputGroup>
  )
}
