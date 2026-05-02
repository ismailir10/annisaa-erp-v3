import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../select"

function renderTrigger(ui: React.ReactElement) {
  render(ui)
  return screen.getByRole("combobox")
}

describe("<Select> auto-derived items", () => {
  it("renders the <SelectItem> label on the trigger when value matches (enum-style value)", () => {
    const trigger = renderTrigger(
      <Select value="TUITION">
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="TUITION">SPP Bulanan</SelectItem>
          <SelectItem value="REGISTRATION">Uang Pangkal</SelectItem>
        </SelectContent>
      </Select>
    )
    expect(trigger.textContent).toContain("SPP Bulanan")
    expect(trigger.textContent).not.toContain("TUITION")
  })

  it("renders the label when options are produced via .map() (dynamic cuid-style value)", () => {
    const programs = [
      { id: "prog_abc123", name: "Day Care" },
      { id: "prog_xyz789", name: "TKIT A" },
    ]
    const trigger = renderTrigger(
      <Select value="prog_abc123">
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {programs.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
    expect(trigger.textContent).toContain("Day Care")
    expect(trigger.textContent).not.toContain("prog_abc123")
  })

  it("walks into <SelectGroup> and conditional fragments", () => {
    const showExtra = true
    const trigger = renderTrigger(
      <Select value="y">
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="x">X label</SelectItem>
            {showExtra && <SelectItem value="y">Y label</SelectItem>}
          </SelectGroup>
        </SelectContent>
      </Select>
    )
    expect(trigger.textContent).toContain("Y label")
  })

  it("prefers an explicitly-passed items prop over derived record", () => {
    const trigger = renderTrigger(
      <Select
        value="k"
        items={{ k: "Explicit Label" }}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="k">Derived Label</SelectItem>
        </SelectContent>
      </Select>
    )
    expect(trigger.textContent).toContain("Explicit Label")
    expect(trigger.textContent).not.toContain("Derived Label")
  })

  it("falls through to rendering the raw value when no matching <SelectItem> exists", () => {
    const trigger = renderTrigger(
      <Select value="unknown_id">
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">A</SelectItem>
        </SelectContent>
      </Select>
    )
    expect(trigger.textContent).toContain("unknown_id")
  })
})
