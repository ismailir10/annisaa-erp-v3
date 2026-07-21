/**
 * build-import-sql.ts — Prod roster re-import generator (cycle 2026-07-21-prod-roster-reimport).
 *
 * Reads the authoritative roster sheet (siswa_2026-07-16) from Siswa-Talib.xlsx and emits
 * ONE idempotent, transactional import.sql that:
 *   - snapshots the live student→guardian links keyed by normalized student name,
 *   - hard-deletes the Student graph + student-linked history (Parents are preserved),
 *   - re-inserts the sheet's active students (excludes `Keluar`) with deterministic ids,
 *   - enrolls each into the ClassSection whose name == its "Kelas" for AY 2026/2027,
 *   - rebuilds guardian links for returning students from the snapshot (rename alias map),
 *   - creates a WALI parent + link for genuinely-new students (dedup by existing name).
 *
 * The SQL asserts row counts and that every student got exactly one enrollment; any
 * mismatch RAISEs and rolls back the whole transaction. Re-running with the same sheet
 * reproduces the same end-state (deterministic ids, full wipe-then-insert).
 *
 * Because prod is only reachable via the Supabase MCP (SQL passed inline as a string),
 * the output is split into two artifacts written next to this script:
 *   - stage.sql     — bulk-loads the 166 rows into a persistent table public._roster_stage.
 *   - transform.sql — compact logic (no inline row data): asserts an md5 content-hash over
 *                     the staged rows (so any transmission corruption ABORTS), then does the
 *                     wipe/insert/enroll/relink and count assertions, ending at COMMIT.
 * The expected hash is embedded in transform.sql, so a faithful stage load is a precondition
 * for the transform to commit.
 *
 * Usage: tsx scripts/import-roster/build-import-sql.ts <path-to-xlsx>
 *
 * NOTE: the xlsx and the emitted *.sql carry PII and are gitignored. Only this generator
 * is committed.
 */
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ExcelJS from 'exceljs'

const TENANT = 'tenant_annisaa'
const AY = 'ay_2026_2027'
const SHEET = 'siswa_2026-07-16'
const ENROLL_DATE = '2026-07-01'

// Student names whose spelling changed in the sheet vs prod. Maps the OLD (prod) normalized
// name → NEW (sheet) normalized name so the guardian-link snapshot follows the rename.
const RENAME_ALIASES: Record<string, string> = {
  'azhima hafsah nafisa': 'azhima hafshah nafisa',
  'orca barraq': 'orca barraq ameer',
}

type Row = {
  tmpid: string
  name: string
  nickname: string | null
  gender: string | null
  birthPlace: string | null
  dob: string | null
  status: string
  nis: string | null
  nisn: string | null
  nik: string | null
  kk: string | null
  address: string | null
  livingWith: string | null
  kelas: string
  waliName: string | null
  waliPhone: string | null
}

const COLS = {
  name: 'Nama Lengkap',
  nickname: 'Nama Panggilan',
  gender: 'Jenis Kelamin',
  birthPlace: 'Tempat Lahir',
  dob: 'Tanggal Lahir',
  status: 'Status',
  nis: 'NIS',
  nisn: 'NISN',
  nik: 'NIK',
  kk: 'No. KK',
  address: 'Alamat',
  livingWith: 'Tinggal Bersama',
  kelas: 'Kelas',
  wali: 'Nama Wali',
  waliPhone: 'No. Telepon Wali',
} as const

function norm(s: unknown): string {
  return String(s ?? '').trim().replace(/\s+/g, ' ')
}
function nn(s: unknown): string | null {
  const v = norm(s)
  return v === '' ? null : v
}
function digits(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') {
    if (!Number.isInteger(v)) return null
    return BigInt(v).toString()
  }
  const d = String(v).replace(/[^\d]/g, '')
  return d === '' ? null : d
}
function toDob(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  if (v instanceof Date) {
    // exceljs returns UTC midnight for date cells; format as calendar date.
    const y = v.getUTCFullYear()
    const m = String(v.getUTCMonth() + 1).padStart(2, '0')
    const d = String(v.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const s = String(v).trim()
  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`
  return null
}
function toGender(v: unknown): string | null {
  const s = norm(v).toLowerCase()
  if (s.startsWith('laki')) return 'L'
  if (s.startsWith('perempuan')) return 'P'
  return null
}
function toLivingWith(v: unknown): string | null {
  const s = norm(v).toLowerCase()
  if (s === '') return null
  if (s.startsWith('orang')) return 'ORANG_TUA'
  if (s.startsWith('wali')) return 'WALI'
  return 'LAINNYA'
}
function toPhone(v: unknown): string | null {
  const d = digits(v)
  if (!d) return null
  if (d.startsWith('0')) return d
  if (d.startsWith('62')) return '0' + d.slice(2)
  if (d.startsWith('8')) return '0' + d
  return d
}
function tmpid(name: string): string {
  return createHash('md5').update(name.toLowerCase()).digest('hex').slice(0, 20)
}
function sql(v: string | null): string {
  if (v === null) return 'NULL'
  return `'${v.replace(/'/g, "''")}'`
}

async function main() {
  const xlsxPath = process.argv[2]
  if (!xlsxPath) {
    console.error('usage: tsx build-import-sql.ts <path-to-xlsx>')
    process.exit(1)
  }
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(xlsxPath)
  const ws = wb.getWorksheet(SHEET)
  if (!ws) throw new Error(`sheet "${SHEET}" not found`)

  // Map header label → column index from row 1.
  const header: Record<string, number> = {}
  ws.getRow(1).eachCell((cell, col) => {
    header[norm(cell.value)] = col
  })
  for (const label of Object.values(COLS)) {
    if (!(label in header)) throw new Error(`missing column "${label}"`)
  }
  const cell = (r: ExcelJS.Row, label: string) => r.getCell(header[label]).value

  const rows: Row[] = []
  const seen = new Set<string>()
  let excludedKeluar = 0
  let excludedBlankKelas = 0

  ws.eachRow((r, i) => {
    if (i === 1) return
    const name = norm(cell(r, COLS.name))
    if (!name) return
    const status = norm(cell(r, COLS.status)).toLowerCase()
    if (status === 'keluar') {
      excludedKeluar++
      return
    }
    const kelas = norm(cell(r, COLS.kelas))
    if (!kelas) {
      excludedBlankKelas++
      console.error(`WARN: blank Kelas, skipping "${name}"`)
      return
    }
    const key = name.toLowerCase()
    if (seen.has(key)) throw new Error(`duplicate student name: "${name}"`)
    seen.add(key)
    rows.push({
      tmpid: tmpid(name),
      name,
      nickname: nn(cell(r, COLS.nickname)),
      gender: toGender(cell(r, COLS.gender)),
      birthPlace: nn(String(nn(cell(r, COLS.birthPlace)) ?? '').replace(/,\s*$/, '')),
      dob: toDob(cell(r, COLS.dob)),
      status: 'ACTIVE',
      nis: digits(cell(r, COLS.nis)),
      nisn: digits(cell(r, COLS.nisn)),
      nik: digits(cell(r, COLS.nik)),
      kk: digits(cell(r, COLS.kk)),
      address: nn(cell(r, COLS.address)),
      livingWith: toLivingWith(cell(r, COLS.livingWith)),
      kelas,
      waliName: nn(cell(r, COLS.wali)),
      waliPhone: toPhone(cell(r, COLS.waliPhone)),
    })
  })

  const missingDob = rows.filter((r) => !r.dob)
  if (missingDob.length) throw new Error(`missing DOB: ${missingDob.map((r) => r.name).join(', ')}`)

  const N = rows.length

  // Canonical per-row field order for the content hash (must match the SQL concat below).
  const fields = (r: Row): (string | null)[] => [
    r.tmpid, r.name, r.nickname, r.gender, r.birthPlace, r.dob, r.status, r.nis, r.nisn,
    r.nik, r.kk, r.address, r.livingWith, r.kelas, r.waliName, r.waliPhone,
  ]
  const US = '' // unit separator (chr 31)
  const RS = '' // record separator (chr 30)
  const sorted = [...rows].sort((a, b) => (a.tmpid < b.tmpid ? -1 : a.tmpid > b.tmpid ? 1 : 0))
  const canonical = sorted
    .map((r) => fields(r).map((v) => (v === null ? '\\N' : v)).join(US))
    .join(RS)
  const expectedHash = createHash('md5').update(canonical).digest('hex')

  // ---- stage.sql : persistent staging table + bulk rows (carries all PII data) ----
  const stage: string[] = []
  stage.push(`-- GENERATED — stage.sql. Bulk-loads ${N} active students into public._roster_stage.`)
  stage.push(`-- Content hash (md5): ${expectedHash}`)
  stage.push(`DROP TABLE IF EXISTS public._roster_stage;`)
  stage.push(`CREATE TABLE public._roster_stage (`)
  stage.push(`  tmpid text PRIMARY KEY, name text, nickname text, gender text, "birthPlace" text, dob text,`)
  stage.push(`  status text, nis text, nisn text, nik text, kk text, address text, "livingWith" text,`)
  stage.push(`  kelas text, wali_name text, wali_phone text`)
  stage.push(`);`)
  stage.push(`INSERT INTO public._roster_stage VALUES`)
  const values = rows.map((r) => `  (${fields(r).map(sql).join(', ')})`)
  stage.push(values.join(',\n') + ';')
  stage.push('')

  // ---- transform.sql : compact logic, no inline row data ----
  const t: string[] = []
  const p = (s = '') => t.push(s)
  p(`-- GENERATED — transform.sql. Reads public._roster_stage; wipes + rebuilds the Student`)
  p(`-- graph (Parents preserved). Precondition: stage.sql loaded faithfully (hash-checked).`)
  p(`BEGIN;`)
  p(``)
  p(`-- 0. Guards: tenant present, stage row count + content hash must match generation.`)
  p(`DO $$ DECLARE h text; c int; BEGIN`)
  p(`  IF NOT EXISTS (SELECT 1 FROM public."Tenant" WHERE id='${TENANT}') THEN RAISE EXCEPTION 'tenant ${TENANT} missing'; END IF;`)
  p(`  SELECT count(*) INTO c FROM public._roster_stage;`)
  p(`  IF c <> ${N} THEN RAISE EXCEPTION 'stage rows %, expected ${N}', c; END IF;`)
  p(`  SELECT md5(string_agg(row_str, chr(30) ORDER BY tmpid)) INTO h FROM (`)
  p(`    SELECT tmpid, concat_ws(chr(31),`)
  p(`      coalesce(tmpid,'\\N'), coalesce(name,'\\N'), coalesce(nickname,'\\N'), coalesce(gender,'\\N'),`)
  p(`      coalesce("birthPlace",'\\N'), coalesce(dob,'\\N'), coalesce(status,'\\N'), coalesce(nis,'\\N'),`)
  p(`      coalesce(nisn,'\\N'), coalesce(nik,'\\N'), coalesce(kk,'\\N'), coalesce(address,'\\N'),`)
  p(`      coalesce("livingWith",'\\N'), coalesce(kelas,'\\N'), coalesce(wali_name,'\\N'), coalesce(wali_phone,'\\N')`)
  p(`    ) AS row_str FROM public._roster_stage) q;`)
  p(`  IF h IS DISTINCT FROM '${expectedHash}' THEN RAISE EXCEPTION 'stage hash % != expected ${expectedHash} (corrupt load)', h; END IF;`)
  p(`END $$;`)
  p(``)
  p(`-- 1. Assert every Kelas resolves to a ClassSection for the AY (fail early).`)
  p(`DO $$ DECLARE bad text; BEGIN`)
  p(`  SELECT string_agg(DISTINCT s.kelas, ', ') INTO bad FROM public._roster_stage s`)
  p(`  WHERE NOT EXISTS (SELECT 1 FROM public."ClassSection" cs WHERE cs.name=s.kelas AND cs."academicYearId"='${AY}');`)
  p(`  IF bad IS NOT NULL THEN RAISE EXCEPTION 'unmapped Kelas: %', bad; END IF;`)
  p(`END $$;`)
  p(``)
  p(`-- 2. Snapshot live guardian links keyed by normalized student name (before any delete).`)
  p(`CREATE TEMP TABLE _link_snap ON COMMIT DROP AS`)
  p(`  SELECT lower(btrim(s.name)) AS nname, g."parentId", g.relationship, g."isPrimary", g."childOrder"`)
  p(`  FROM public."StudentGuardian" g JOIN public."Student" s ON s.id = g."studentId";`)
  for (const [oldN, newN] of Object.entries(RENAME_ALIASES)) {
    p(`UPDATE _link_snap SET nname=${sql(newN)} WHERE nname=${sql(oldN)};`)
  }
  p(``)
  p(`-- 3. Wipe student-linked history + the Student graph. Parents are NOT touched.`)
  for (const tbl of ['StudentAttendance', 'StudentMeasurement', 'ReportCardEntry', 'AssessmentEntry', 'StudentAssessment', 'Admission', 'Invoice']) {
    p(`DELETE FROM public."${tbl}";`)
  }
  p(`UPDATE public."EnrollmentApplication" SET "studentId"=NULL WHERE "studentId" IS NOT NULL;`)
  p(`DELETE FROM public."StudentEnrollment";`)
  p(`DELETE FROM public."StudentGuardian";`)
  p(`DELETE FROM public."Student";`)
  p(``)
  p(`-- 4. Insert students with deterministic ids.`)
  p(`INSERT INTO public."Student" (id, "tenantId", name, nickname, "dateOfBirth", gender, address, status, nis, nisn, "birthPlace", nik, "kkNumber", "livingWith", "createdAt")`)
  p(`  SELECT 'imp_'||tmpid, '${TENANT}', name, nickname, dob, gender, address, status, nis, nisn, "birthPlace", nik, kk, "livingWith", now()`)
  p(`  FROM public._roster_stage;`)
  p(``)
  p(`-- 5. Enroll each student into the section matching its Kelas.`)
  p(`INSERT INTO public."StudentEnrollment" (id, "studentId", "classSectionId", "enrollDate", status, "createdAt")`)
  p(`  SELECT 'ime_'||s.tmpid, 'imp_'||s.tmpid, cs.id, '${ENROLL_DATE}', 'ACTIVE', now()`)
  p(`  FROM public._roster_stage s JOIN public."ClassSection" cs ON cs.name=s.kelas AND cs."academicYearId"='${AY}';`)
  p(``)
  p(`-- 6. Rebuild guardian links for RETURNING students from the snapshot.`)
  p(`INSERT INTO public."StudentGuardian" (id, "studentId", "parentId", relationship, "isPrimary", "childOrder", status)`)
  p(`  SELECT 'img_'||substr(md5(s.id||'|'||ls."parentId"),1,20), s.id, ls."parentId", ls.relationship, ls."isPrimary", ls."childOrder", 'ACTIVE'`)
  p(`  FROM public."Student" s JOIN _link_snap ls ON ls.nname=lower(btrim(s.name))`)
  p(`  ON CONFLICT ("studentId","parentId") DO NOTHING;`)
  p(``)
  p(`-- 7. NEW students (no snapshot link): create/reuse a WALI Parent by name, then link.`)
  p(`INSERT INTO public."Parent" (id, "tenantId", name, phone, status, "createdAt")`)
  p(`  SELECT DISTINCT 'imw_'||substr(md5(lower(btrim(s.wali_name))),1,20), '${TENANT}', s.wali_name, s.wali_phone, 'ACTIVE', now()`)
  p(`  FROM public._roster_stage s`)
  p(`  WHERE s.wali_name IS NOT NULL`)
  p(`    AND NOT EXISTS (SELECT 1 FROM public."StudentGuardian" g WHERE g."studentId"='imp_'||s.tmpid)`)
  p(`    AND NOT EXISTS (SELECT 1 FROM public."Parent" p WHERE p."tenantId"='${TENANT}' AND lower(btrim(p.name))=lower(btrim(s.wali_name)))`)
  p(`  ON CONFLICT DO NOTHING;`)
  p(`INSERT INTO public."StudentGuardian" (id, "studentId", "parentId", relationship, "isPrimary", status)`)
  p(`  SELECT 'img_'||substr(md5('imp_'||s.tmpid||'|'||p.id),1,20), 'imp_'||s.tmpid, p.id, 'WALI', true, 'ACTIVE'`)
  p(`  FROM public._roster_stage s`)
  p(`  JOIN public."Parent" p ON p."tenantId"='${TENANT}' AND lower(btrim(p.name))=lower(btrim(s.wali_name))`)
  p(`  WHERE s.wali_name IS NOT NULL`)
  p(`    AND NOT EXISTS (SELECT 1 FROM public."StudentGuardian" g WHERE g."studentId"='imp_'||s.tmpid)`)
  p(`  ON CONFLICT ("studentId","parentId") DO NOTHING;`)
  p(``)
  p(`-- 8. Assertions: counts must match, every student enrolled + has >=1 guardian.`)
  p(`DO $$ DECLARE nstu int; nenr int; noguard int; BEGIN`)
  p(`  SELECT count(*) INTO nstu FROM public."Student";`)
  p(`  IF nstu <> ${N} THEN RAISE EXCEPTION 'student count %, expected ${N}', nstu; END IF;`)
  p(`  SELECT count(*) INTO nenr FROM public."StudentEnrollment";`)
  p(`  IF nenr <> ${N} THEN RAISE EXCEPTION 'enrollment count %, expected ${N}', nenr; END IF;`)
  p(`  SELECT count(*) INTO noguard FROM public."Student" s WHERE NOT EXISTS (SELECT 1 FROM public."StudentGuardian" g WHERE g."studentId"=s.id);`)
  p(`  IF noguard <> 0 THEN RAISE EXCEPTION '% students without a guardian', noguard; END IF;`)
  p(`END $$;`)
  p(``)
  p(`DROP TABLE public._roster_stage;`)
  p(`COMMIT;`)
  p(``)

  // Per-row hashes (debug aid to locate a corrupt staged row vs prod).
  const rowHashes = sorted
    .map((r) => {
      const rowStr = fields(r).map((v) => (v === null ? '\\N' : v)).join(US)
      return `${r.tmpid}\t${createHash('md5').update(rowStr).digest('hex')}`
    })
    .join('\n')

  const dir = dirname(fileURLToPath(import.meta.url))
  writeFileSync(join(dir, 'stage.sql'), stage.join('\n'))
  writeFileSync(join(dir, 'transform.sql'), t.join('\n'))
  writeFileSync(join(dir, 'rowhashes.tsv'), rowHashes + '\n')
  console.error(`OK: ${N} students (${excludedKeluar} Keluar excluded, ${excludedBlankKelas} blank-Kelas).`)
  console.error(`Wrote stage.sql + transform.sql. Content hash: ${expectedHash}`)
}

main().catch((e) => {
  console.error('ERROR:', e.message)
  process.exit(1)
})
