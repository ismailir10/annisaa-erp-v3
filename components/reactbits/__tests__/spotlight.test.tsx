import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { Spotlight } from "../spotlight"

function pointerEvent(type: string, init: { clientX?: number; clientY?: number; pointerType: string }) {
  const { pointerType, ...rest } = init
  const e = new MouseEvent(type, { bubbles: false, ...rest })
  Object.defineProperty(e, "pointerType", { value: pointerType })
  return e
}

function setup() {
  const utils = render(
    <div data-testid="host" className="relative isolate overflow-hidden">
      <Spotlight />
      <p>content</p>
    </div>,
  )
  const host = screen.getByTestId("host")
  host.getBoundingClientRect = () =>
    ({ left: 10, top: 20, right: 210, bottom: 120, width: 200, height: 100, x: 10, y: 20, toJSON: () => ({}) }) as DOMRect
  const layer = host.querySelector<HTMLElement>('[data-slot="spotlight"]')!
  return { ...utils, host, layer }
}

describe("Spotlight", () => {
  beforeEach(() => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0)
      return 1
    })
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("renders an aria-hidden decorative layer inside its parent", () => {
    const { host, layer } = setup()
    expect(layer).not.toBeNull()
    expect(layer.getAttribute("aria-hidden")).toBe("true")
    expect(layer.parentElement).toBe(host)
    expect(layer.className).toContain("pointer-events-none")
  })

  it("tracks the mouse and fades out on leave", () => {
    const { host, layer } = setup()
    host.dispatchEvent(pointerEvent("pointermove", { clientX: 110, clientY: 70, pointerType: "mouse" }))
    expect(layer.style.getPropertyValue("--spot-x")).toBe("100px")
    expect(layer.style.getPropertyValue("--spot-y")).toBe("50px")
    expect(layer.style.opacity).toBe("1")

    host.dispatchEvent(pointerEvent("pointerleave", { pointerType: "mouse" }))
    expect(layer.style.opacity).toBe("0")
  })

  it("ignores touch pointers", () => {
    const { host, layer } = setup()
    host.dispatchEvent(pointerEvent("pointermove", { clientX: 110, clientY: 70, pointerType: "touch" }))
    expect(layer.style.getPropertyValue("--spot-x")).toBe("")
    expect(layer.style.opacity).not.toBe("1")
  })

  it("removes its listeners on unmount", () => {
    const { host, layer, unmount } = setup()
    const remove = vi.spyOn(host, "removeEventListener")
    unmount()
    expect(remove).toHaveBeenCalledWith("pointermove", expect.any(Function))
    expect(remove).toHaveBeenCalledWith("pointerleave", expect.any(Function))
    expect(() =>
      host.dispatchEvent(pointerEvent("pointermove", { clientX: 5, clientY: 5, pointerType: "mouse" })),
    ).not.toThrow()
    expect(layer.style.getPropertyValue("--spot-x")).toBe("")
  })
})
