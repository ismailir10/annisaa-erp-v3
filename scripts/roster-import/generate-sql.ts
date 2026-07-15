/**
 * One-off SQL generator for cycle 2026-07-15-roster-import-2526, Task T3.
 *
 * Reuses the already-tested parse-xlsx/map-fields/dedupe/overrides/config
 * modules to compute the exact import plan, then emits SQL INSERT
 * statements instead of writing via Prisma (this environment has no prod
 * DATABASE_URL — the generated SQL is reviewed, then executed via the
 * Supabase MCP tool against project vxwywmvpxetdgnxejjgk).
 *
 * Existing-state snapshot (studentsByNis, familiesByPairKey) is hardcoded
 * below from a direct prod SQL read taken immediately before this run
 * (2026-07-16) — prod currently has 0 students with a non-null NIS, so
 * every record here is a fresh insert, never a skip.
 *
 * Usage: npx tsx scripts/roster-import/generate-sql.ts > /tmp/roster-import.sql
 */
import { randomBytes } from "node:crypto";
import {
  loadWorkbook,
  parseKelasSheet,
  type RosterRecord,
} from "./parse-xlsx";
import {
  parseIndonesianBirthDate,
  buildAddress,
  mapLivingWith,
  buildParentRecord,
} from "./map-fields";
import { planImport, type ExistingSnapshot, type ExistingFamily } from "./dedupe";
import {
  CAMPUS_BY_KELAS,
  MAPPED_KELAS_CODES,
} from "./config";
import { isExcluded, isWithdrawn, noGuardianOk, TD1_MANUAL_RECORD } from "./overrides";

// NOTE: scripts/reseed/org.ts's TENANT.id constant ("t_annisaa") does NOT
// match prod — verified directly via SQL against project vxwywmvpxetdgnxejjgk
// that both existing Student rows and the ClassSections just created in this
// cycle use "tenant_annisaa". Using the real value, not the script constant.
const TENANT_ID = "tenant_annisaa";

// Real ClassSection ids created in prod during this cycle's T3 (verified via SQL, all 13).
const CLASS_SECTION_ID_BY_KELAS: Record<string, string> = {
  A1: "cmrm7f5vo010504k6wfy834al",
  A2: "cmrm7gy2n017d04k64sh0n919",
  A3: "cmrm7irtm01el04k6vad9ph68",
  A4: "cmrm7kv0e01lt04k6j7ad708t",
  B1: "cmrm7n4w801t104k6l87wemxq",
  B2: "cmrm7pvb2000104ktoqv7qlc3",
  B3: "cmrm7s91o020904k6safihlsi",
  B4: "cmrm7u6q6027h04k6c8o8f2mc",
  KB1: "cmrm78go900eh04k6p67fqnp2",
  KB3: "cmrm7asv300lp04k6b5x73s4f",
  KB4: "cmrm7cqhc00sx04k6udqrov7z",
  TD1: "cmrm740w4000104k6paj85v9d",
  TD2: "cmrm75exj007904k66g5fprqv",
};

const FILE = "/Users/ismailrabbanii/Downloads/Data siswa TA 2526 (REupdated).xlsx";

function genId(): string {
  return "cimp" + randomBytes(12).toString("hex");
}

function sqlStr(v: string | null | undefined): string {
  if (v === null || v === undefined) return "NULL";
  return `'${v.replace(/'/g, "''")}'`;
}

function sqlDate(v: string | null | undefined): string {
  if (!v) return "NULL";
  return `'${v}'`;
}

async function main() {
  const workbook = await loadWorkbook(FILE);

  const recordsByKelas = new Map<string, RosterRecord[]>();
  for (const kelas of MAPPED_KELAS_CODES) {
    recordsByKelas.set(kelas, parseKelasSheet(workbook, kelas));
  }
  if (MAPPED_KELAS_CODES.includes("TD1")) {
    recordsByKelas.set("TD1", [TD1_MANUAL_RECORD]);
  }
  // TD2 needs the leading-space sheet name handled inside parseKelasSheet already.

  const excludedCount = new Map<string, number>();
  for (const [kelas, records] of recordsByKelas) {
    const kept = records.filter((r) => {
      if (isExcluded(r)) {
        excludedCount.set(kelas, (excludedCount.get(kelas) ?? 0) + 1);
        return false;
      }
      return true;
    });
    recordsByKelas.set(kelas, kept);
  }

  const allRecords = Array.from(recordsByKelas.values()).flat();

  const totalExcluded = Array.from(excludedCount.values()).reduce((a, b) => a + b, 0);
  const totalWithdrawn = allRecords.filter((r) => isWithdrawn(r)).length;
  if (totalExcluded !== 6) throw new Error(`expected 6 excluded, got ${totalExcluded}`);
  if (totalWithdrawn !== 2) throw new Error(`expected 2 withdrawn, got ${totalWithdrawn}`);

  // Hardcoded from direct prod SQL read (2026-07-16) — 34 existing families.
  const existingFamiliesRaw: Array<[string, string]> = [
    ["Deni Irawan", "Atik Dwi Kristanti"],
    ["Andre Fauzy Pradana", "Indah Chayatunnisa"],
    ["Syahri Koto", "Rifa Putri N"],
    ["Achmad Syarifudin", "Prawita Martalina Dewi"],
    ["Fajar Sidik", "Dina Tri Cahyani"],
    ["Muhammad Ruswandi Alfan", "Siska Ferdiyanti"],
    ["Joko Darsono", "Paryati"],
    ["Pandit Purnajuara", "Mulki Alifah Hasna"],
    ["Firman", "Darojah Umaroh"],
    ["Muhammad Agung Muslikhuddin", "Puput Suryati"],
    ["Wijaya Wahyudi Akbar", "Ika Juwita Giyaningtyas"],
    ["Frengki Kurniawan", "Umi Kulsum"],
    ["Dwi Anggriawan", "Khusnul Khotimah"],
    ["Sigit Suprianto", "Ai Mulaidah"],
    ["Ocky Pradikha Riadi", "Oktia Charmila"],
    ["Wisnu Iswardana", "Lieny Arina Nur"],
    ["Febriansyah", "Maemunah"],
    ["Sutrisno", "Sukmajannatun Aini"],
    ["Imam Sofwan Hidayat", "Shalia Septianisa"],
    ["Arif Nurdin", "Lenni Mustikasari Mulyani"],
    ["Erwantoro", "Safitri"],
    ["Diastra Augusta Pratama", "Namira Sabila"],
    ["Rafi Hanifan", "Erma Taluvita"],
    ["Muhamad Imam Suswoyo", "Arfiyanti"],
    ["Solehudin", "Rina Erlina"],
    ["Nurudin", "Yulia"],
    ["Putu Mahendra Putra", "Fitrida Magnasari"],
    ["Mochamad Lukman Haris", "Erniati"],
    ["Rangga Aji Pamungkas", "Nabilla Tiya Pratiwi"],
    ["Raden Dedi Oktavianur", "Lisnawati"],
    ["Andri Pambudi", "Isnainni Choirunnisa"],
    ["Badriadi", "Dewi Awaliyah"],
    ["Arietis Pratama", "Nirmana Sakinaruci"],
    ["Lili Rusdiana", "Neni Prihastianingsih"],
  ];
  // parent_id pairs matching the names above, in the same order.
  const existingFamilyParentIds: Array<[string, string]> = [
    ["cmrircrct018704lece3lraip", "cmrircxc8018904lemnkk2i4d"],
    ["cmrird41q018e04lefeg7bwf4", "cmrird9mq018g04letwq89x9i"],
    ["cmrirdgfp018l04leijogbef3", "cmrirdmrf018n04lea78wt88n"],
    ["cmrirdtla018s04leexmgx0ig", "cmrirdzxa018u04lea38n8f5b"],
    ["cmrirfe5x018z04lesybi4elo", "cmrirfeq3019104lehc79j0y3"],
    ["cmrirffqc019604le7g01ga2k", "cmrirfges019804ler13dmb11"],
    ["cmrirfhiq019d04le2dk57uo6", "cmrirfhz1019f04le9mywlh8v"],
    ["cmrirfixb019k04lekfpr95b2", "cmrirfjju019m04le8ezxa5mg"],
    ["cmrirfkfo019r04lesad3ogx7", "cmrirfkwm019t04lelldbb6ae"],
    ["cmriry03l01eo04le6y5lu0rf", "cmriry0qc01eq04le4uuidxyg"],
    ["cmririuvk01ac04lemm5l2out", "cmririvcd01ae04lezocay6wq"],
    ["cmririvtm01ag04le490g6jgo", "cmririw8101ai04ley7tfj5gx"],
    ["cmririx0501ak04leczeksnfk", "cmririxjh01am04lexz19z7j9"],
    ["cmririy0l01ao04lemo2vfqto", "cmririygh01aq04lescg0kf52"],
    ["cmrirkx3701at04levebxdiwl", "cmrirkxns01av04lech3lugiq"],
    ["cmrirkyx401b004le6xr2ae6i", "cmrirkzga01b204lei5yxnny5"],
    ["cmrirl0hs01b704lec18d92in", "cmrirl0x501b904legpkm0k8o"],
    ["cmrirn6hv01be04lev2fuhq75", "cmrirn6yu01bg04lec870xcdk"],
    ["cmrirn7sk01bl04ley2x0nsu4", "cmrirn8c701bn04leunfg1pp7"],
    ["cmrirn9kx01bs04le2zji0hwe", "cmrirna0701bu04lehboel8eo"],
    ["cmrirnayf01bz04lefvtzbi4x", "cmrirnbgm01c104le93dr6dop"],
    ["cmrirph4c01c604le2hhbtdu5", "cmrirphns01c804leo7dtt2o5"],
    ["cmrirpixg01cd04le26duh72k", "cmrirpjgd01cf04lekw8cxv03"],
    ["cmrirpkjm01ck04lemehkfjiv", "cmrirpl5y01cm04lefauxtshl"],
    ["cmrirpmcu01cr04le8wua4764", "cmrirpmrh01ct04leqcsj7mba"],
    ["cmrirrxpv01cy04le8jp01331", "cmrirry7601d004le3ykvhc3b"],
    ["cmrirrz8h01d504leg8mg8ntp", "cmrirrzvm01d704le4ziaiypt"],
    ["cmrirs16u01dc04lecdwr8wjp", "cmrirs1nu01de04lesau7f4f8"],
    ["cmrirs2f901dj04leliru7yp9", "cmrirs2pa01dl04le25hwso6a"],
    ["cmriru3h101dq04le8uq7qig2", "cmriru3vk01ds04lemw7ymyu1"],
    ["cmriru4tr01dx04le5trvy364", "cmriru5g901dz04le4wjhdas0"],
    ["cmriru6ks01e404lelj0zwwly", "cmriru78a01e604le0jkrhekh"],
    ["cmrirw6ro01eb04lev9lasopi", "cmrirw7fa01ed04leyhqd71r9"],
    ["cmrirw8nw01ei04lec9e779xy", "cmrirw96x01ek04lehvnt3yes"],
  ];

  const familiesByPairKey = new Map<string, ExistingFamily>();
  const { familyPairKey } = await import("./dedupe");
  existingFamiliesRaw.forEach(([ayah, ibu], i) => {
    const [ayahParentId, ibuParentId] = existingFamilyParentIds[i];
    familiesByPairKey.set(familyPairKey(ayah, ibu), { ayahParentId, ibuParentId });
  });

  const snapshot: ExistingSnapshot = {
    studentsByNis: new Map(), // prod has 0 students with non-null NIS
    familiesByPairKey,
  };

  const plan = planImport(allRecords, snapshot);

  console.error(`[generate-sql] toCreateStudents=${plan.toCreateStudents.length} toSkipStudents=${plan.toSkipStudents.length} toReuseParents=${plan.toReuseParents.length} toCreateParents=${plan.toCreateParents.length}`);

  const parentIdByPendingKey = new Map<string, string>();
  const sql: string[] = [];
  sql.push("BEGIN;");

  for (const cp of plan.toCreateParents) {
    const id = genId();
    parentIdByPendingKey.set(cp.pendingKey, id);
    const rawFields = cp.role === "AYAH" ? cp.record.ayah : cp.record.ibu;
    const fields = buildParentRecord(rawFields);
    sql.push(
      `INSERT INTO "Parent" (id, "tenantId", name, nik, education, occupation, "employer", "employerAddress", "employerCity", "incomeRange", status, "createdAt") VALUES (` +
        `${sqlStr(id)}, ${sqlStr(TENANT_ID)}, ${sqlStr(fields.name || cp.name)}, ${sqlStr(fields.nik)}, ${sqlStr(fields.education)}, ${sqlStr(fields.occupation)}, ${sqlStr(fields.employer)}, ${sqlStr(fields.employerAddress)}, ${sqlStr(fields.employerCity)}, ${sqlStr(fields.incomeRange)}, 'ACTIVE', now());`,
    );
  }

  for (const record of plan.toCreateStudents) {
    const kelas = record.kelas;
    const classSectionId = CLASS_SECTION_ID_BY_KELAS[kelas];
    if (!classSectionId) throw new Error(`no ClassSection id for kelas ${kelas}`);

    let dateOfBirth: string | undefined;
    if (record.birthDateRaw) {
      try {
        dateOfBirth = parseIndonesianBirthDate(record.birthDateRaw);
      } catch (err) {
        console.error(`[generate-sql] birth date parse failed kelas=${kelas} nis=${record.nis ?? "none"}: ${err instanceof Error ? err.message : "unknown"}`);
      }
    }
    const livingWith = mapLivingWith(record.tinggal) || null;
    const address = buildAddress(record.alamat, record.desaKelurahan, record.kecamatan) || null;
    const withdrawn = isWithdrawn(record);
    const studentId = genId();

    // Compute guardian links FIRST — a guardianless record (other than the
    // documented TD1 exception) must be skipped entirely, including its
    // Student row, not left half-inserted with zero guardians.
    const guardianLinks: Array<{ role: "AYAH" | "IBU"; parentId: string }> = [];
    for (const r of plan.toReuseParents) {
      if (r.record !== record) continue;
      const parentId = r.source === "existing_prod" ? r.parentId : parentIdByPendingKey.get(r.parentId)!;
      if (!parentId) throw new Error(`unresolved pending parent id for kelas=${kelas} role=${r.role} pendingKey=${r.parentId}`);
      guardianLinks.push({ role: r.role, parentId });
    }
    for (const c of plan.toCreateParents) {
      if (c.record !== record) continue;
      const parentId = parentIdByPendingKey.get(c.pendingKey);
      if (!parentId) throw new Error(`unresolved created parent id for kelas=${kelas} role=${c.role} pendingKey=${c.pendingKey}`);
      guardianLinks.push({ role: c.role, parentId });
    }

    if (guardianLinks.length === 0 && !noGuardianOk(record)) {
      console.error(`[generate-sql] SKIPPED (no guardians) kelas=${kelas} nis=${record.nis ?? "none"} name=${record.namaLengkap}`);
      continue;
    }

    sql.push(
      `INSERT INTO "Student" (id, "tenantId", name, nickname, "dateOfBirth", gender, address, nis, nisn, "birthPlace", nik, "kkNumber", "livingWith", status, "createdAt") VALUES (` +
        `${sqlStr(studentId)}, ${sqlStr(TENANT_ID)}, ${sqlStr(record.namaLengkap)}, ${sqlStr(record.namaPanggilan)}, ${sqlDate(dateOfBirth)}, ${sqlStr(record.gender)}, ${sqlStr(address)}, ${sqlStr(record.nis)}, ${sqlStr(record.nisn)}, ${sqlStr(record.birthPlace)}, ${sqlStr(record.nikAnak)}, ${sqlStr(record.kkNumber)}, ${sqlStr(livingWith)}, ${withdrawn ? "'WITHDRAWN'" : "'ACTIVE'"}, now());`,
    );

    const hasAyah = guardianLinks.some((l) => l.role === "AYAH");
    for (const link of guardianLinks) {
      const isPrimary = hasAyah ? link.role === "AYAH" : link.role === "IBU";
      const sgId = genId();
      sql.push(
        `INSERT INTO "StudentGuardian" (id, "studentId", "parentId", relationship, "isPrimary", "childOrder", status) VALUES (` +
          `${sqlStr(sgId)}, ${sqlStr(studentId)}, ${sqlStr(link.parentId)}, ${sqlStr(link.role)}, ${isPrimary}, ${record.childOrder ?? "NULL"}, 'ACTIVE');`,
      );
    }

    const enrollmentId = genId();
    sql.push(
      `INSERT INTO "StudentEnrollment" (id, "studentId", "classSectionId", "enrollDate", status, "createdAt") VALUES (` +
        `${sqlStr(enrollmentId)}, ${sqlStr(studentId)}, ${sqlStr(classSectionId)}, '2026-07-01', ${withdrawn ? "'WITHDRAWN'" : "'ACTIVE'"}, now());`,
    );
  }

  sql.push("COMMIT;");
  console.log(sql.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
