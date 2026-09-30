import { describe, it, expect, vi } from "vitest";
import { Prisma } from "@/lib/generated/prisma/client";
import { changeGuardianLinkStatus, GuardianPrimaryError, pickReplacementPrimary } from "../primary";

describe("pickReplacementPrimary (CORE-4)", () => {
  const cands = [
    { id: "c", relationship: "WALI" },
    { id: "b", relationship: "IBU" },
    { id: "a", relationship: "OTHER" },
  ];

  it("prefers AYAH, then IBU, then WALI, then OTHER when the admin does not choose", () => {
    expect(pickReplacementPrimary(cands)?.id).toBe("b");
    expect(pickReplacementPrimary([{ id: "x", relationship: "AYAH" }, ...cands])?.id).toBe("x");
  });

  it("honours the admin's choice", () => {
    expect(pickReplacementPrimary(cands, "a")?.id).toBe("a");
  });

  it("refuses a chosen guardian who is not a remaining active guardian", () => {
    expect(() => pickReplacementPrimary(cands, "zzz")).toThrow(GuardianPrimaryError);
  });

  it("returns null when nobody is left", () => {
    expect(pickReplacementPrimary([])).toBeNull();
  });
});

describe("changeGuardianLinkStatus reads isPrimary inside the transaction", () => {
  // A tx double whose target link is the primary *now*, whatever the route
  // read before the transaction (a concurrent deactivation promoted it).
  function makeDb(linkIsPrimary: () => boolean) {
    const tx = {
      studentGuardian: {
        findUnique: vi.fn(async () => ({ isPrimary: linkIsPrimary() })),
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: object }) => ({
          id: where.id,
          ...data,
        })),
        findMany: vi.fn(async () => [
          { id: "g3", relationship: "IBU", isPrimary: false, parent: { name: "Ibu Sari" } },
        ]),
        count: vi.fn(),
      },
    };
    const $transaction = vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx));
    return { db: { $transaction } as never, tx, $transaction };
  }

  it("promotes a replacement when the link became primary after the route read it", async () => {
    const { db, tx } = makeDb(() => true);
    const out = await changeGuardianLinkStatus(db, { linkId: "g2", studentId: "s1", status: "INACTIVE" });
    expect(out.promoted).toEqual({ id: "g3", name: "Ibu Sari" });
    expect(tx.studentGuardian.update).toHaveBeenCalledWith({ where: { id: "g3" }, data: { isPrimary: true } });
  });

  it("leaves primaries alone when deactivating a non-primary link", async () => {
    const { db, tx } = makeDb(() => false);
    const out = await changeGuardianLinkStatus(db, { linkId: "g2", studentId: "s1", status: "INACTIVE" });
    expect(out.promoted).toBeNull();
    expect(tx.studentGuardian.update).toHaveBeenCalledTimes(1);
  });

  it("re-reads isPrimary on the P2034 retry instead of reusing the first attempt's view", async () => {
    let attempt = 0;
    const { db, tx, $transaction } = makeDb(() => attempt > 1);
    $transaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => {
      attempt += 1;
      if (attempt === 1) {
        throw new Prisma.PrismaClientKnownRequestError("serialization failure", {
          code: "P2034",
          clientVersion: "test",
        });
      }
      return cb(tx);
    });
    const out = await changeGuardianLinkStatus(db, { linkId: "g2", studentId: "s1", status: "INACTIVE" });
    expect($transaction).toHaveBeenCalledTimes(2);
    expect(out.promoted?.id).toBe("g3");
  });
});
