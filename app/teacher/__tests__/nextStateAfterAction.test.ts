import { describe, it, expect } from "vitest";
import { nextStateAfterAction } from "../home-client";

describe("nextStateAfterAction", () => {
  it("check-in from null record → sets status=PRESENT, checkInTime to now, checkOutTime null", () => {
    const result = nextStateAfterAction(null, "check-in");
    expect(result.status).toBe("PRESENT");
    expect(result.checkInTime).toBeTruthy();
    expect(result.checkOutTime).toBeNull();
  });

  it("check-in when record already has checkInTime → preserves existing checkInTime", () => {
    const record = { status: "LATE", checkInTime: "2026-05-03T06:10:00.000Z", checkOutTime: null };
    const result = nextStateAfterAction(record, "check-in");
    expect(result.checkInTime).toBe("2026-05-03T06:10:00.000Z");
    expect(result.status).toBe("PRESENT");
    expect(result.checkOutTime).toBeNull();
  });

  it("check-out from checked-in record → sets checkOutTime, preserves checkInTime + status", () => {
    const record = {
      status: "LATE",
      checkInTime: "2026-05-03T07:30:00.000Z",
      checkOutTime: null,
    };
    const result = nextStateAfterAction(record, "check-out");
    expect(result.checkInTime).toBe("2026-05-03T07:30:00.000Z");
    expect(result.status).toBe("LATE");
    expect(result.checkOutTime).toBeTruthy();
  });

  it("check-out from null record → synthesises both times (fallback path)", () => {
    const result = nextStateAfterAction(null, "check-out");
    expect(result.checkInTime).toBeTruthy();
    expect(result.checkOutTime).toBeTruthy();
    expect(result.status).toBe("PRESENT");
  });

  it("check-out preserves existing checkOutTime if already set", () => {
    const record = {
      status: "PRESENT",
      checkInTime: "2026-05-03T07:00:00.000Z",
      checkOutTime: "2026-05-03T14:00:00.000Z",
    };
    const result = nextStateAfterAction(record, "check-out");
    expect(result.checkOutTime).toBe("2026-05-03T14:00:00.000Z");
  });

  it("check-in always returns status=PRESENT regardless of prior status", () => {
    const record = { status: "LATE", checkInTime: null, checkOutTime: null };
    const result = nextStateAfterAction(record, "check-in");
    expect(result.status).toBe("PRESENT");
  });

  it("check-out preserves LATE status from prior record", () => {
    const record = { status: "LATE", checkInTime: "2026-05-03T08:10:00.000Z", checkOutTime: null };
    const result = nextStateAfterAction(record, "check-out");
    expect(result.status).toBe("LATE");
  });
});
