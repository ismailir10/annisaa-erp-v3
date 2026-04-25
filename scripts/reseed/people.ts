import type { PrismaClient } from "../../lib/generated/prisma/client";
import { createRng } from "./rng";
import {
  BOY_FIRST_NAMES,
  GIRL_FIRST_NAMES,
  FAMILY_NAMES,
  FEMALE_PARENT_FIRST_NAMES,
  MALE_PARENT_FIRST_NAMES,
  OCCUPATIONS,
  INCOME_RANGES,
  EDUCATION_LEVELS,
  BIRTH_PLACES,
  BLOOD_TYPES,
  HOBBIES,
  ALLERGIES,
  BEKASI_ADDRESSES,
  EMPLOYERS,
  EMPLOYER_CITIES,
  pickWeightedBank,
} from "./names";
import { PRESERVED_USERS } from "./users";
import type { SeedOrgResult } from "./org";
import { ACADEMIC_YEARS, CAMPUSES, PROGRAMS, sectionKey } from "./org";

export const SEED_COUNTS = {
  teachersTotal: 25, // includes 2 preserved teachers
  supportStaff: 3,
  activeStudents: 180,
  graduatedStudents: 20,
} as const;

export type StudentPlan = {
  index: number;
  name: string;
  nickname: string;
  gender: "L" | "P";
  dateOfBirth: string; // YYYY-MM-DD
  status: "ACTIVE" | "GRADUATED";
  programCode: "DCARE" | "KB" | "TKIT-A" | "TKIT-B";
  campusCode: "TAMAN_ASTER" | "METLAND";
  // Government compliance + lifecycle.
  nis: string;
  nisn: string;
  nik: string;
  kkNumber: string;
  birthPlace: string;
  livingWith: "ORANG_TUA" | "WALI" | "LAINNYA";
  address: string;
  metadata: string; // JSON: { hobby, bloodType, allergies }
  /** Only preserved students expose a known fixed email handle. */
  forcedName?: string;
  /** If true, this student is the child of a preserved guardian. */
  preservedGuardianEmail?: string;
};

export type ParentPlan = {
  displayName: string;
  email: string | null;
  phone: string;
  whatsapp: string;
  address: string;
  nik: string;
  occupation: string;
  incomeRange: string;
  education: string;
  employer: string;
  employerAddress: string;
  employerCity: string;
  childrenTotal: number;
  /** Studentindex references in StudentPlan. */
  childIndexes: number[];
  /** Explicit preserved user email, if this parent maps to one. */
  preservedUserEmail?: string;
  /** Relationship to primary child (AYAH | IBU | WALI). */
  relationship: "AYAH" | "IBU" | "WALI";
};

export type EmployeePlan = {
  kode: string;
  nama: string;
  formalName: string;
  email: string;
  noHp: string;
  jabatan: string;
  campusCode: "TAMAN_ASTER" | "METLAND";
  hireDate: string;
  bankAccountNo: string;
  bankName: string;
  bpjsEnrolled: boolean;
  isTeacher: boolean;
  preservedUserEmail?: string;
};

// ─── Helpers ───────────────────────────────────────────────────

const NIS_YEAR_PREFIX = "2024"; // every reseed enrolls students in 2024/25.
function synthNis(seq: number): string {
  return `${NIS_YEAR_PREFIX}.${String(seq).padStart(4, "0")}`;
}
/** 10-digit synthetic. Prefix `99` to mark obviously fake. */
function synthNisn(rng: ReturnType<typeof createRng>): string {
  return `99${String(rng.int(10000000, 99999999))}`;
}
/** 16-digit synthetic. Prefix `9` so it cannot be mistaken for a real NIK
 *  (real Indonesian NIKs start with a province code, never `9`).
 */
function synthNik(rng: ReturnType<typeof createRng>): string {
  return (
    "9" +
    String(rng.int(100000, 999999)) +
    String(rng.int(100000, 999999)) +
    String(rng.int(100, 999))
  );
}
function synthKk(rng: ReturnType<typeof createRng>): string {
  return synthNik(rng);
}
function synthBankAccount(rng: ReturnType<typeof createRng>): string {
  // 10-digit string, no formatting.
  return String(rng.int(1_000_000_000, 9_999_999_999));
}

/**
 * Generate a name that has not appeared in `seen`. Tries `genFn` up to
 * `maxAttempts` times; on collision falls back to numeric suffix.
 * Mutates `seen` to add the chosen name.
 */
export function uniqueName(
  seen: Set<string>,
  genFn: () => string,
  maxAttempts = 10,
): { name: string; collisions: number; usedSuffix: boolean } {
  let collisions = 0;
  for (let i = 0; i < maxAttempts; i++) {
    const candidate = genFn();
    if (!seen.has(candidate)) {
      seen.add(candidate);
      return { name: candidate, collisions, usedSuffix: false };
    }
    collisions++;
  }
  // Suffix fallback. Try once more with a fresh draw — generator may
  // happen to land on something unseen, in which case we keep it bare.
  const base = genFn();
  if (!seen.has(base)) {
    seen.add(base);
    return { name: base, collisions, usedSuffix: false };
  }
  let n = 2;
  while (seen.has(`${base} ${n}`)) n++;
  const final = `${base} ${n}`;
  seen.add(final);
  return { name: final, collisions, usedSuffix: true };
}

/** Derive a program code appropriate for a given child age. */
function programForAge(ageMonths: number): StudentPlan["programCode"] {
  if (ageMonths < 36) return "DCARE";
  if (ageMonths < 48) return "KB";
  if (ageMonths < 60) return "TKIT-A";
  return "TKIT-B";
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Build the rich Student field set common to every plan row. */
function makeStudentExtras(
  rng: ReturnType<typeof createRng>,
  index: number,
): {
  nis: string;
  nisn: string;
  nik: string;
  kkNumber: string;
  birthPlace: string;
  livingWith: StudentPlan["livingWith"];
  address: string;
  metadata: string;
} {
  const livingRoll = rng.next();
  const livingWith: StudentPlan["livingWith"] =
    livingRoll < 0.9 ? "ORANG_TUA" : livingRoll < 0.98 ? "WALI" : "LAINNYA";
  return {
    nis: synthNis(index + 1),
    nisn: synthNisn(rng),
    nik: synthNik(rng),
    kkNumber: synthKk(rng),
    birthPlace: rng.pick(BIRTH_PLACES as readonly string[]),
    livingWith,
    address: rng.pick(BEKASI_ADDRESSES as readonly string[]),
    metadata: JSON.stringify({
      hobby: rng.pick(HOBBIES as readonly string[]),
      bloodType: rng.pick(BLOOD_TYPES as readonly string[]),
      allergies: rng.pick(ALLERGIES as readonly string[]),
    }),
  };
}

/** Generate N plausible Indonesian student names + DOB + gender + full fields. */
export function planStudents(opts: {
  rng: ReturnType<typeof createRng>;
  activeCount: number;
  graduatedCount: number;
  /** Reference "today" for age calc. */
  today: Date;
}): StudentPlan[] {
  const plan: StudentPlan[] = [];
  const { rng, activeCount, graduatedCount, today } = opts;
  const seenNames = new Set<string>();

  // Preserved children — register first so synthetic names cannot collide.
  const bilal: StudentPlan = {
    index: 0,
    name: "Bilal Hakim",
    nickname: "Bilal",
    gender: "L",
    dateOfBirth: formatDate(new Date(today.getFullYear() - 5, 3, 12)),
    status: "ACTIVE",
    programCode: "TKIT-A",
    campusCode: "TAMAN_ASTER",
    ...makeStudentExtras(rng, 0),
    forcedName: "Bilal Hakim",
    preservedGuardianEmail: "rightjet.hq@gmail.com",
  };
  seenNames.add(bilal.name);
  plan.push(bilal);

  const faris: StudentPlan = {
    index: 1,
    name: "Ahmad Faris Abdullah",
    nickname: "Faris",
    gender: "L",
    dateOfBirth: formatDate(new Date(today.getFullYear() - 6, 6, 20)),
    status: "ACTIVE",
    programCode: "TKIT-B",
    campusCode: "METLAND",
    ...makeStudentExtras(rng, 1),
    forcedName: "Ahmad Faris Abdullah",
    preservedGuardianEmail: "commandprompt.adhan@gmail.com",
  };
  seenNames.add(faris.name);
  plan.push(faris);

  // Active students 2..activeCount-1.
  for (let i = plan.length; i < activeCount; i++) {
    const gender = rng.bool(0.5) ? "L" : "P";
    const firstPool = gender === "L" ? BOY_FIRST_NAMES : GIRL_FIRST_NAMES;
    const ageMonths = rng.int(24, 72);
    const dob = new Date(today);
    dob.setMonth(dob.getMonth() - ageMonths);
    const programCode = programForAge(ageMonths);
    const campusCode: StudentPlan["campusCode"] =
      programCode === "DCARE"
        ? "TAMAN_ASTER"
        : rng.bool(0.5)
          ? "TAMAN_ASTER"
          : "METLAND";

    const { name: fullName } = uniqueName(seenNames, () => {
      const first = rng.pick(firstPool);
      const middle = rng.pick(firstPool);
      const last = rng.pick(FAMILY_NAMES);
      return `${first} ${middle !== first ? middle + " " : ""}${last}`;
    });
    const firstWord = fullName.split(" ")[0]!;

    plan.push({
      index: i,
      name: fullName,
      nickname: firstWord,
      gender,
      dateOfBirth: formatDate(dob),
      status: "ACTIVE",
      programCode,
      campusCode,
      ...makeStudentExtras(rng, i),
    });
  }

  // Graduated cohort — all TKIT-B 2024/25, aged ~6.5-7.
  for (let i = 0; i < graduatedCount; i++) {
    const gender = rng.bool(0.5) ? "L" : "P";
    const firstPool = gender === "L" ? BOY_FIRST_NAMES : GIRL_FIRST_NAMES;
    const dob = new Date(today);
    dob.setMonth(dob.getMonth() - rng.int(78, 84));
    const idx = activeCount + i;
    const { name: fullName } = uniqueName(seenNames, () => {
      const first = rng.pick(firstPool);
      const last = rng.pick(FAMILY_NAMES);
      return `${first} ${last}`;
    });
    const firstWord = fullName.split(" ")[0]!;
    plan.push({
      index: idx,
      name: fullName,
      nickname: firstWord,
      gender,
      dateOfBirth: formatDate(dob),
      status: "GRADUATED",
      programCode: "TKIT-B",
      campusCode: rng.bool(0.5) ? "TAMAN_ASTER" : "METLAND",
      ...makeStudentExtras(rng, idx),
    });
  }

  return plan;
}

/** One mother per student for simplicity; preserved mothers for the 2 fixed children. */
export function planParents(opts: {
  rng: ReturnType<typeof createRng>;
  students: StudentPlan[];
}): ParentPlan[] {
  const { rng, students } = opts;
  const parents: ParentPlan[] = [];
  const seenParentNames = new Set<string>();

  function richParentExtras(
    isHomemaker: boolean,
  ): Pick<
    ParentPlan,
    | "address"
    | "nik"
    | "employer"
    | "employerAddress"
    | "employerCity"
    | "childrenTotal"
  > {
    const employer = isHomemaker ? "Wiraswasta" : rng.pick(EMPLOYERS as readonly string[]);
    return {
      address: rng.pick(BEKASI_ADDRESSES as readonly string[]),
      nik: synthNik(rng),
      employer,
      employerAddress: isHomemaker
        ? "-"
        : `Jl. Industri Raya No. ${rng.int(1, 200)}, Kawasan Industri`,
      employerCity: rng.pick(EMPLOYER_CITIES as readonly string[]),
      // weighted 1/2/3 children
      childrenTotal: rng.next() < 0.45 ? 1 : rng.next() < 0.85 ? 2 : 3,
    };
  }

  // Preserved guardian 1 → Bilal Hakim.
  const ibuNurul: ParentPlan = {
    displayName: "Ibu Nurul",
    email: "rightjet.hq@gmail.com",
    phone: "+6281200000001",
    whatsapp: "+6281200000001",
    occupation: "Karyawan Swasta",
    incomeRange: "5-10jt",
    education: "S1",
    childIndexes: [0],
    preservedUserEmail: "rightjet.hq@gmail.com",
    relationship: "IBU",
    ...richParentExtras(false),
  };
  parents.push(ibuNurul);
  seenParentNames.add(ibuNurul.displayName);

  // Preserved guardian 2 → Ahmad Faris Abdullah.
  const ibuRina: ParentPlan = {
    displayName: "Ibu Rina",
    email: "commandprompt.adhan@gmail.com",
    phone: "+6281200000002",
    whatsapp: "+6281200000002",
    occupation: "Ibu Rumah Tangga",
    incomeRange: "3-5jt",
    education: "S1",
    childIndexes: [1],
    preservedUserEmail: "commandprompt.adhan@gmail.com",
    relationship: "IBU",
    ...richParentExtras(true),
  };
  parents.push(ibuRina);
  seenParentNames.add(ibuRina.displayName);

  // Synthetic parents — one mother per remaining student.
  for (const s of students.slice(2)) {
    const occupation = rng.pick(OCCUPATIONS as readonly string[]);
    const isHomemaker = occupation === "Ibu Rumah Tangga";
    const { name: displayName } = uniqueName(seenParentNames, () => {
      const motherFirst = rng.pick(FEMALE_PARENT_FIRST_NAMES);
      const motherLast = rng.pick(FAMILY_NAMES);
      return `Ibu ${motherFirst} ${motherLast}`;
    });
    const phoneStr = `+62812${String(rng.int(10000000, 99999999))}`;
    parents.push({
      displayName,
      email: `parent-${s.index}@example.test`,
      phone: phoneStr,
      whatsapp: phoneStr, // most Indonesian parents use the same number
      occupation,
      incomeRange: rng.pick(INCOME_RANGES as readonly string[]),
      education: rng.pick(EDUCATION_LEVELS as readonly string[]),
      childIndexes: [s.index],
      relationship: "IBU",
      ...richParentExtras(isHomemaker),
    });
  }

  return parents;
}

/** Teacher + support-staff Employee rows. First 2 teachers = preserved. */
export function planEmployees(opts: {
  rng: ReturnType<typeof createRng>;
}): EmployeePlan[] {
  const { rng } = opts;
  const employees: EmployeePlan[] = [];
  const seen = new Set<string>();

  function bankFields(): { bankAccountNo: string; bankName: string } {
    return {
      bankAccountNo: synthBankAccount(rng),
      bankName: pickWeightedBank(rng.next()),
    };
  }
  const phoneOf = () => `+62812${String(rng.int(10000000, 99999999))}`;

  // Preserved teachers.
  employees.push({
    kode: "IR01",
    nama: "Ismail Rabbani",
    formalName: "Ismail Rabbani, S.Pd.",
    email: "ismail10rabbanii@gmail.com",
    noHp: "+6281200000010",
    jabatan: "Guru Kelas",
    campusCode: "TAMAN_ASTER",
    hireDate: "2022-07-01",
    ...bankFields(),
    bpjsEnrolled: true,
    isTeacher: true,
    preservedUserEmail: "ismail10rabbanii@gmail.com",
  });
  seen.add("Ismail Rabbani");
  employees.push({
    kode: "WR03",
    nama: "Wira Raja",
    formalName: "Wira Raja, S.Pd.",
    email: "wirarajaism@gmail.com",
    noHp: "+6281200000011",
    jabatan: "Guru Kelas",
    campusCode: "METLAND",
    hireDate: "2021-07-01",
    ...bankFields(),
    bpjsEnrolled: true,
    isTeacher: true,
    preservedUserEmail: "wirarajaism@gmail.com",
  });
  seen.add("Wira Raja");

  // Synthetic teachers T01..T23.
  for (let i = 1; i <= 23; i++) {
    const gender = rng.bool(0.75) ? "P" : "L"; // mostly female teachers
    const pool = gender === "P" ? GIRL_FIRST_NAMES : BOY_FIRST_NAMES;
    const { name: nama } = uniqueName(seen, () => {
      const first = rng.pick(pool);
      const last = rng.pick(FAMILY_NAMES);
      return `${first} ${last}`;
    });
    const kode = `T${String(i).padStart(2, "0")}`;
    const hireYear = rng.int(2020, 2025);
    employees.push({
      kode,
      nama,
      formalName: `${nama}, S.Pd.`,
      email: `teacher-${kode.toLowerCase()}@annisaa.staging.test`,
      noHp: phoneOf(),
      jabatan: "Guru Kelas",
      campusCode: rng.bool(0.5) ? "TAMAN_ASTER" : "METLAND",
      hireDate: `${hireYear}-07-01`,
      ...bankFields(),
      bpjsEnrolled: rng.bool(0.9),
      isTeacher: true,
    });
  }

  // Support staff.
  const supportRoles: Array<{ kode: string; jabatan: string }> = [
    { kode: "S01", jabatan: "Admin Tata Usaha" },
    { kode: "S02", jabatan: "Kasir" },
    { kode: "S03", jabatan: "OB" },
  ];
  for (const role of supportRoles) {
    const { name: nama } = uniqueName(seen, () => {
      const first = rng.pick(MALE_PARENT_FIRST_NAMES);
      const last = rng.pick(FAMILY_NAMES);
      return `${first} ${last}`;
    });
    employees.push({
      kode: role.kode,
      nama,
      formalName: nama,
      email: `support-${role.kode.toLowerCase()}@annisaa.staging.test`,
      noHp: phoneOf(),
      jabatan: role.jabatan,
      campusCode: "TAMAN_ASTER",
      hireDate: "2022-01-15",
      ...bankFields(),
      bpjsEnrolled: rng.bool(0.9),
      isTeacher: false,
    });
  }

  return employees;
}

// ─── DB writer ──────────────────────────────────────────────────

export type SeedPeopleResult = {
  employeeIdByKode: Record<string, string>;
  /** Student id ordered by StudentPlan.index */
  studentIdByIndex: Record<number, string>;
  parentIdByEmail: Record<string, string>;
  userIdByPreservedEmail: Record<string, string>;
  enrollmentCount: { y24: number; y25: number };
  teachingAssignmentCount: number;
  /** Plans surfaced for downstream seeders. */
  studentPlan: StudentPlan[];
  employeePlan: EmployeePlan[];
  parentPlan: ParentPlan[];
};

export async function seedPeople(
  prisma: PrismaClient,
  org: SeedOrgResult,
  preservedUuidByEmail: Record<string, string>,
  opts: { seed?: number; today?: Date } = {},
): Promise<SeedPeopleResult> {
  const seed = opts.seed ?? 42;
  const today = opts.today ?? new Date();
  const rng = createRng(seed);

  // ── User rows for preserved accounts.
  const userIdByPreservedEmail: Record<string, string> = {};
  for (const u of PRESERVED_USERS) {
    const uuid = preservedUuidByEmail[u.email];
    if (!uuid) {
      throw new Error(
        `seedPeople: missing preserved UUID for ${u.email} — ensurePreservedAuthUsers must run first.`,
      );
    }
    const created = await prisma.user.create({
      data: {
        id: uuid,
        tenantId: org.tenantId,
        email: u.email,
        name: u.name,
        role: u.role,
      },
    });
    userIdByPreservedEmail[u.email] = created.id;
  }

  // ── Employees.
  const employeePlan = planEmployees({ rng });
  const employeeIdByKode: Record<string, string> = {};
  for (const e of employeePlan) {
    const row = await prisma.employee.create({
      data: {
        tenantId: org.tenantId,
        kode: e.kode,
        nama: e.nama,
        formalName: e.formalName,
        email: e.email,
        noHp: e.noHp,
        jabatan: e.jabatan,
        campusId: org.campusIdByCode[e.campusCode],
        hireDate: e.hireDate,
        bankAccountNo: e.bankAccountNo,
        bankName: e.bankName,
        bpjsEnrolled: e.bpjsEnrolled,
      },
    });
    employeeIdByKode[e.kode] = row.id;

    // Connect preserved teacher emails to their User row.
    if (e.preservedUserEmail && userIdByPreservedEmail[e.preservedUserEmail]) {
      await prisma.user.update({
        where: { id: userIdByPreservedEmail[e.preservedUserEmail] },
        data: { employee: { connect: { id: row.id } } },
      });
    }
  }

  // ── Students.
  const studentPlan = planStudents({
    rng,
    activeCount: SEED_COUNTS.activeStudents,
    graduatedCount: SEED_COUNTS.graduatedStudents,
    today,
  });
  const studentIdByIndex: Record<number, string> = {};
  for (const s of studentPlan) {
    const row = await prisma.student.create({
      data: {
        tenantId: org.tenantId,
        name: s.name,
        nickname: s.nickname,
        dateOfBirth: s.dateOfBirth,
        gender: s.gender,
        status: s.status,
        graduationDate:
          s.status === "GRADUATED" ? "2025-06-20" : null,
        nis: s.nis,
        nisn: s.nisn,
        nik: s.nik,
        kkNumber: s.kkNumber,
        birthPlace: s.birthPlace,
        livingWith: s.livingWith,
        address: s.address,
        metadata: s.metadata,
      },
    });
    studentIdByIndex[s.index] = row.id;
  }

  // ── Parents + StudentGuardian + User rows for preserved guardians.
  const parentPlan = planParents({ rng, students: studentPlan });
  const parentIdByEmail: Record<string, string> = {};
  for (const p of parentPlan) {
    const row = await prisma.parent.create({
      data: {
        tenantId: org.tenantId,
        name: p.displayName,
        email: p.email,
        phone: p.phone,
        whatsapp: p.whatsapp,
        address: p.address,
        nik: p.nik,
        occupation: p.occupation,
        incomeRange: p.incomeRange,
        education: p.education,
        employer: p.employer,
        employerAddress: p.employerAddress,
        employerCity: p.employerCity,
        childrenTotal: p.childrenTotal,
      },
    });
    if (p.email) parentIdByEmail[p.email] = row.id;

    // Connect preserved guardian User to this Parent.
    if (p.preservedUserEmail && userIdByPreservedEmail[p.preservedUserEmail]) {
      await prisma.user.update({
        where: { id: userIdByPreservedEmail[p.preservedUserEmail] },
        data: { parent: { connect: { id: row.id } } },
      });
    }

    // StudentGuardian links.
    for (const childIdx of p.childIndexes) {
      const studentId = studentIdByIndex[childIdx];
      if (!studentId) continue;
      await prisma.studentGuardian.create({
        data: {
          studentId,
          parentId: row.id,
          relationship: p.relationship,
          isPrimary: true,
          childOrder: 1,
        },
      });
    }
  }

  // ── Enrollments (2024/25 for everyone incl. graduated, 2025/26 for active only).
  const y24 = org.academicYearIdByName["2024/2025"];
  const y25 = org.academicYearIdByName["2025/2026"];
  let enrolledY24 = 0;
  let enrolledY25 = 0;

  for (const s of studentPlan) {
    // 2024/25 section: graduated were TKIT-B; active students "aged down" one tier.
    const y24Program: StudentPlan["programCode"] =
      s.status === "GRADUATED"
        ? "TKIT-B"
        : ((): StudentPlan["programCode"] => {
            // Roll the program back one tier for historical enrollment.
            const order: StudentPlan["programCode"][] = [
              "DCARE",
              "KB",
              "TKIT-A",
              "TKIT-B",
            ];
            const idx = order.indexOf(s.programCode);
            return order[Math.max(0, idx - 1)] ?? "DCARE";
          })();
    const y24Key = sectionKey({
      academicYearName: "2024/2025",
      campusCode: s.campusCode === "METLAND" && y24Program === "DCARE" ? "TAMAN_ASTER" : s.campusCode,
      programCode: y24Program,
      sectionName: "",
      capacity: 0,
    });
    const y24SectionId = org.classSectionIdByKey[y24Key];
    if (!y24SectionId) {
      throw new Error(
        `seedPeople: no 2024/25 class section for key '${y24Key}' (student index ${s.index}, ${s.name}).`,
      );
    }
    await prisma.studentEnrollment.create({
      data: {
        studentId: studentIdByIndex[s.index],
        classSectionId: y24SectionId,
        enrollDate: "2024-07-15",
        status: s.status === "GRADUATED" ? "GRADUATED" : "ACTIVE",
      },
    });
    enrolledY24++;
    void y24; // keep import live for future use

    if (s.status === "ACTIVE") {
      const y25Key = sectionKey({
        academicYearName: "2025/2026",
        campusCode: s.campusCode,
        programCode: s.programCode,
        sectionName: "",
        capacity: 0,
      });
      const y25SectionId = org.classSectionIdByKey[y25Key];
      if (!y25SectionId) {
        throw new Error(
          `seedPeople: no 2025/26 class section for key '${y25Key}' (student index ${s.index}, ${s.name}).`,
        );
      }
      await prisma.studentEnrollment.create({
        data: {
          studentId: studentIdByIndex[s.index],
          classSectionId: y25SectionId,
          enrollDate: "2025-07-14",
          status: "ACTIVE",
        },
      });
      enrolledY25++;
      void y25;
    }
  }

  // ── TeachingAssignment for 2025/26 sections only.
  // Every active section gets one HOMEROOM + one ASSISTANT from the teacher pool.
  const teacherEmployees = employeePlan.filter((e) => e.isTeacher);
  let teacherCursor = 0;
  let teachingAssignmentCount = 0;

  for (const campus of CAMPUSES) {
    for (const programCode of campus.programs) {
      const key = sectionKey({
        academicYearName: "2025/2026",
        campusCode: campus.code,
        programCode,
        sectionName: "",
        capacity: 0,
      });
      const classSectionId = org.classSectionIdByKey[key];
      if (!classSectionId) continue;

      for (const role of ["HOMEROOM", "ASSISTANT"] as const) {
        const teacher = teacherEmployees[teacherCursor % teacherEmployees.length]!;
        teacherCursor++;
        await prisma.teachingAssignment.create({
          data: {
            employeeId: employeeIdByKode[teacher.kode],
            classSectionId,
            role,
          },
        });
        teachingAssignmentCount++;
      }
    }
  }

  // Touch ACADEMIC_YEARS + PROGRAMS to silence the "unused import" lint signal.
  void ACADEMIC_YEARS;
  void PROGRAMS;

  return {
    employeeIdByKode,
    studentIdByIndex,
    parentIdByEmail,
    userIdByPreservedEmail,
    enrollmentCount: { y24: enrolledY24, y25: enrolledY25 },
    teachingAssignmentCount,
    studentPlan,
    employeePlan,
    parentPlan,
  };
}
