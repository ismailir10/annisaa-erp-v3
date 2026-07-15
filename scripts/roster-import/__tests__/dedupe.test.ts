import { describe, it, expect } from "vitest";
import {
  planImport,
  normalizeParentName,
  normalizeNis,
  familyPairKey,
  type ExistingSnapshot,
} from "../dedupe";
import type { AyahIbuFields, RosterRecord } from "../parse-xlsx";

function ayahIbu(nama: string | null, overrides: Partial<AyahIbuFields> = {}): AyahIbuFields {
  return {
    nama,
    nik: null,
    pendidikan: null,
    pekerjaan: null,
    namaKantor: null,
    alamatKantor: null,
    kota: null,
    penghasilan: null,
    ...overrides,
  };
}

function record(overrides: Partial<RosterRecord> & { namaLengkap: string }): RosterRecord {
  return {
    kelas: "A1",
    rowNumber: 9,
    no: 1,
    nis: null,
    nisn: null,
    namaPanggilan: null,
    gender: null,
    birthPlace: null,
    birthDateRaw: null,
    nikAnak: null,
    kkNumber: null,
    childOrder: null,
    tinggal: "Orang Tua",
    alamat: null,
    desaKelurahan: null,
    kecamatan: null,
    telpAyah: null,
    telpIbu: null,
    ayah: ayahIbu(null),
    ibu: ayahIbu(null),
    ...overrides,
  };
}

function emptySnapshot(): ExistingSnapshot {
  return { studentsByNis: new Map(), familiesByPairKey: new Map() };
}

function addFamily(
  snapshot: ExistingSnapshot,
  ayahName: string,
  ibuName: string,
  ayahParentId: string,
  ibuParentId: string,
): void {
  snapshot.familiesByPairKey.set(familyPairKey(ayahName, ibuName), {
    ayahName,
    ibuName,
    ayahParentId,
    ibuParentId,
  });
}

describe("normalizeParentName", () => {
  it("lowercases, trims, and collapses whitespace", () => {
    expect(normalizeParentName("  Frengki   Kurniawan ")).toBe("frengki kurniawan");
  });
});

describe("normalizeNis", () => {
  it("trims and passes through a real NIS", () => {
    expect(normalizeNis(" 2526137301 ")).toBe("2526137301");
  });
  it("treats blank and '-' as null", () => {
    expect(normalizeNis("")).toBeNull();
    expect(normalizeNis("-")).toBeNull();
    expect(normalizeNis(null)).toBeNull();
    expect(normalizeNis(undefined)).toBeNull();
  });
});

describe("familyPairKey", () => {
  it("is case/whitespace insensitive and order-sensitive (ayah, ibu)", () => {
    expect(familyPairKey("Ahmad Fauzi", "Rina Wati")).toBe(
      familyPairKey("  ahmad   fauzi ", " RINA WATI "),
    );
    expect(familyPairKey("Ahmad Fauzi", "Rina Wati")).not.toBe(
      familyPairKey("Rina Wati", "Ahmad Fauzi"),
    );
  });
});

describe("planImport", () => {
  it("plans a brand-new student with two brand-new parents when nothing exists yet", () => {
    const r = record({
      namaLengkap: "Erinka Abrina Alnita",
      nis: "2526139321",
      ayah: ayahIbu("Nico Susanto"),
      ibu: ayahIbu("Ovita Saputri"),
    });
    const plan = planImport([r], emptySnapshot());

    expect(plan.toCreateStudents).toEqual([r]);
    expect(plan.toSkipStudents).toEqual([]);
    expect(plan.toReuseParents).toEqual([]);
    expect(plan.toCreateParents).toHaveLength(2);
    expect(plan.toCreateParents.map((p) => p.name).sort()).toEqual(
      ["Nico Susanto", "Ovita Saputri"].sort(),
    );
  });

  it("skips a student whose NIS already exists in prod (idempotency) and plans nothing else for it", () => {
    const r = record({
      namaLengkap: "Abizard Nabil Muttaqi",
      nis: "2526137301",
      ayah: ayahIbu("Supardi"),
      ibu: ayahIbu("Siti Anisah"),
    });
    const snapshot = emptySnapshot();
    snapshot.studentsByNis.set("2526137301", { id: "student_existing_1", name: "Abizard Nabil Muttaqi" });

    const plan = planImport([r], snapshot);

    expect(plan.toCreateStudents).toEqual([]);
    expect(plan.toSkipStudents).toEqual([
      { record: r, existingStudentId: "student_existing_1", nis: "2526137301" },
    ]);
    // No parent planning at all for a skipped student — even though its
    // parent names aren't in the snapshot, re-running must produce zero
    // new inserts for this row.
    expect(plan.toReuseParents).toEqual([]);
    expect(plan.toCreateParents).toEqual([]);
  });

  it("creates a student with a blank/missing NIS — never treated as a match or a skip", () => {
    const r = record({
      namaLengkap: "Hasna Azzahra",
      nis: null,
      ayah: ayahIbu("Some Ayah"),
      ibu: ayahIbu("Some Ibu"),
    });
    const snapshot = emptySnapshot();
    // A different existing student that also happens to have no NIS stored
    // must never accidentally "match" a blank-NIS import row.
    snapshot.studentsByNis.set("", { id: "should_never_match", name: "Unrelated" });

    const plan = planImport([r], snapshot);

    expect(plan.toCreateStudents).toEqual([r]);
    expect(plan.toSkipStudents).toEqual([]);
  });

  it("reuses an existing prod Parent PAIR by exact case-insensitive (ayah, ibu) match (sibling family already in prod)", () => {
    // Frengki Kurniawan + Umi Kulsum already have a child in prod
    // (Aliza Zhafira Kurniawan); this row is their second child
    // (Arsen Zhafier Kurniawan) arriving in the new roster file.
    const r = record({
      namaLengkap: "Arsen Zhafier Kurniawan",
      nis: "2526199999",
      ayah: ayahIbu("frengki kurniawan"), // case differs from prod's stored casing
      ibu: ayahIbu("Umi Kulsum"),
    });
    const snapshot = emptySnapshot();
    addFamily(snapshot, "Frengki Kurniawan", "Umi Kulsum", "parent_frengki", "parent_umi");

    const plan = planImport([r], snapshot);

    expect(plan.toCreateStudents).toEqual([r]);
    expect(plan.toCreateParents).toEqual([]);
    expect(plan.toReuseParents).toHaveLength(2);
    expect(plan.toReuseParents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "AYAH", source: "existing_prod", parentId: "parent_frengki" }),
        expect.objectContaining({ role: "IBU", source: "existing_prod", parentId: "parent_umi" }),
      ]),
    );
  });

  it("does NOT merge on a lone shared name across two unrelated families (cross-wiring guard)", () => {
    // Existing prod family: Ahmad Fauzi + Rina Wati.
    const snapshot = emptySnapshot();
    addFamily(snapshot, "Ahmad Fauzi", "Rina Wati", "parent_ahmad_prod", "parent_rina_prod");

    // Unrelated new family that happens to share the exact same AYAH full
    // name, but a completely different mother — must NOT reuse either
    // existing Parent row just because "Ahmad Fauzi" matches in isolation.
    const r = record({
      namaLengkap: "Unrelated Child",
      nis: "2526400001",
      ayah: ayahIbu("Ahmad Fauzi"),
      ibu: ayahIbu("Dewi Lestari"),
    });

    const plan = planImport([r], snapshot);

    expect(plan.toReuseParents).toEqual([]);
    expect(plan.toCreateParents).toHaveLength(2);
    expect(plan.toCreateParents.map((p) => p.name).sort()).toEqual(
      ["Ahmad Fauzi", "Dewi Lestari"].sort(),
    );
    // Explicitly confirm neither of prod's real parent ids leaked into the plan.
    const allParentIdsUsed = [
      ...plan.toReuseParents.map((p) => p.parentId),
      ...plan.toCreateParents.map((p) => p.pendingKey),
    ];
    expect(allParentIdsUsed).not.toContain("parent_ahmad_prod");
    expect(allParentIdsUsed).not.toContain("parent_rina_prod");
  });

  it("reuses a within-batch sibling's parent PAIR instead of creating a duplicate, when neither parent is in prod yet", () => {
    const first = record({
      namaLengkap: "Kakak Pertama",
      nis: "2526100001",
      ayah: ayahIbu("Budi Santoso"),
      ibu: ayahIbu("Wati Rahayu"),
    });
    const second = record({
      namaLengkap: "Adik Kedua",
      nis: "2526100002",
      ayah: ayahIbu("Budi Santoso"),
      ibu: ayahIbu("Wati Rahayu"),
    });

    const plan = planImport([first, second], emptySnapshot());

    // Exactly one create per parent (not two), regardless of two children.
    expect(plan.toCreateParents).toHaveLength(2);
    const ayahCreate = plan.toCreateParents.find((p) => p.role === "AYAH")!;
    const ibuCreate = plan.toCreateParents.find((p) => p.role === "IBU")!;
    expect(ayahCreate.record).toBe(first); // planned against the first sighting
    expect(ibuCreate.record).toBe(first);

    // The second child's guardian links resolve via reuse, pointing at the
    // same pendingKey as the first child's planned create.
    const secondReuses = plan.toReuseParents.filter((p) => p.record === second);
    expect(secondReuses).toHaveLength(2);
    expect(secondReuses.every((p) => p.source === "pending_in_run")).toBe(true);
    expect(secondReuses.find((p) => p.role === "AYAH")!.parentId).toBe(ayahCreate.pendingKey);
    expect(secondReuses.find((p) => p.role === "IBU")!.parentId).toBe(ibuCreate.pendingKey);

    // The first child itself is not "reusing" anything — it's the creator.
    expect(plan.toReuseParents.some((p) => p.record === first)).toBe(false);
  });

  it("does NOT merge two within-batch records that share only one parent's name (not a full pair match)", () => {
    const first = record({
      namaLengkap: "Anak Keluarga A",
      nis: "2526500001",
      ayah: ayahIbu("Joko Widodo"),
      ibu: ayahIbu("Sri Mulyani"),
    });
    // Different mother — same ayah first+last name coincidentally.
    const second = record({
      namaLengkap: "Anak Keluarga B",
      nis: "2526500002",
      ayah: ayahIbu("Joko Widodo"),
      ibu: ayahIbu("Ani Yudhoyono"),
    });

    const plan = planImport([first, second], emptySnapshot());

    // 4 distinct parents created — no cross-family reuse from the shared
    // "Joko Widodo" name alone.
    expect(plan.toCreateParents).toHaveLength(4);
    expect(plan.toReuseParents).toEqual([]);
  });

  it("handles all 3 known sibling-family cases from the cycle doc in one batch", () => {
    const records = [
      record({
        namaLengkap: "Arsen Zhafier Kurniawan",
        nis: "2526200001",
        ayah: ayahIbu("Frengki Kurniawan"),
        ibu: ayahIbu("Umi Kulsum"),
      }),
      record({
        namaLengkap: "Lathisa Deana Maheswari",
        nis: "2526200002",
        ayah: ayahIbu("Andri Pambudi"),
        ibu: ayahIbu("Isnainni Choirunnisa"),
      }),
      record({
        namaLengkap: "Rafisqy Alfarezi Irawan",
        nis: "2526200003",
        ayah: ayahIbu("Deni Irawan"),
        ibu: ayahIbu("Atik Dwi Kristanti"),
      }),
    ];
    const snapshot = emptySnapshot();
    addFamily(snapshot, "Frengki Kurniawan", "Umi Kulsum", "p1", "p2");
    addFamily(snapshot, "Andri Pambudi", "Isnainni Choirunnisa", "p3", "p4");
    addFamily(snapshot, "Deni Irawan", "Atik Dwi Kristanti", "p5", "p6");

    const plan = planImport(records, snapshot);

    expect(plan.toCreateStudents).toHaveLength(3);
    expect(plan.toCreateParents).toEqual([]); // zero new duplicate parents
    expect(plan.toReuseParents).toHaveLength(6);
    expect(plan.toReuseParents.every((p) => p.source === "existing_prod")).toBe(true);
  });

  it("always creates fresh (never reuses) when only one parent name is present on the row", () => {
    const r = record({
      namaLengkap: "Single Guardian Kid",
      nis: "2526300001",
      ayah: ayahIbu(null),
      ibu: ayahIbu("Only Ibu"),
    });
    const snapshot = emptySnapshot();
    // Even if an existing family happens to have this same name as its
    // IBU, a solo record can never pair-verify, so it must not reuse it.
    addFamily(snapshot, "Some Other Ayah", "Only Ibu", "should_not_be_used", "should_not_be_used_2");

    const plan = planImport([r], snapshot);

    expect(plan.toCreateStudents).toEqual([r]);
    expect(plan.toReuseParents).toEqual([]);
    expect(plan.toCreateParents).toHaveLength(1);
    expect(plan.toCreateParents[0].role).toBe("IBU");
    expect(plan.toCreateParents[0].name).toBe("Only Ibu");
  });
});
