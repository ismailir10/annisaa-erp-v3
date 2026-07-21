#!/usr/bin/env python3
"""
Historical class-history backfill generator (PR #403 pattern, idempotent, additive).
READ inputs: artifacts/Siswa-Talib.xlsx per-year sheets + a prod snapshot JSON
             (student id/name/nis/dob/current-campus) piped in as /tmp/prod_current.json.
EMITS: history-import.sql (additive, ON CONFLICT DO NOTHING, deterministic hist_* ids,
       every enrollment notes-tagged) + a preview stats block on stdout.
Decisions encoded:
  - Trust 2025/2026 + 2024/2025 fully; spot-check 2023/2024 + 2022/2023 by age/program, exclude implausible.
  - Campus = student's CURRENT campus; a section whose matched students span >1 current campus is
    AMBIGUOUS -> held out (not written), flagged for manual review.
  - status: AcademicYear/ClassSection/ClassTrack = INACTIVE; StudentEnrollment = GRADUATED.
"""
import openpyxl, json, re, hashlib, sys, unicodedata
from collections import defaultdict, Counter
from datetime import date

TENANT = "tenant_annisaa"
TAG = "histbackfill-20260721"
XLSX = "artifacts/Siswa-Talib.xlsx"
YEARS = {  # sheet -> (ay_id, name, start_year, end_year, trusted)
    "20252026": ("hist_ay_2025_2026", "2025/2026", 2025, 2026, True),
    "20242025": ("hist_ay_2024_2025", "2024/2025", 2024, 2025, True),
    "20232024": ("hist_ay_2023_2024", "2023/2024", 2023, 2024, False),
    "20222023": ("hist_ay_2022_2023", "2022/2023", 2022, 2023, False),
}
ALIAS = {  # sheet-normalized-name -> prod-normalized-name (from PR #403)
    "azhima hafsah nafisa": "azhima hafshah nafisa",
    "orca barraq": "orca barraq ameer",
}
# owner-approved explicit spot-check overrides: include despite age-band flag (like Andhika via band).
FORCE_INCLUDE = {"farzan ahmad athafariz"}
PROG = {  # sheet Program label -> program id
    "kelompok bermain": "program_kb", "tk islam terpadu": "program_tkit",
    "day care": "program_dcare", "day care 1": "program_dcare", "day care 2": "program_dcare",
    "day care 3": "program_dcare", "day care 4": "program_dcare", "d'care": "program_dcare",
}
def prog_from_kelas(k):
    k=k.upper()
    if k.startswith("KB"): return "program_kb"
    if k.startswith(("A","B")): return "program_tkit"
    return "program_dcare"  # TD, Bayi
# rough age bands (years) per class level, at AY start (Jul 1)
BANDS = {"BAYI 6-12 BULAN":(0.3,1.6),"BAYI 1-2 TAHUN":(0.8,2.8),"TD":(0.8,4.5),
         "KB":(2.3,5.5),"A":(3.5,6.0),"B":(4.5,7.0)}  # KB upper loosened 5.0->5.5 (owner: include Andhika)
CAMPUS_SHORT = {"campus_taman_aster":"Aster","campus_metland_cibitung":"Metland"}
def band(k):
    ku=k.upper()
    for key in ("BAYI 6-12 BULAN","BAYI 1-2 TAHUN"):
        if ku.startswith(key): return BANDS[key]
    if ku.startswith("TD"): return BANDS["TD"]
    if ku.startswith("KB"): return BANDS["KB"]
    if ku.startswith("A"): return BANDS["A"]
    if ku.startswith("B"): return BANDS["B"]
    return None

def norm(s): return re.sub(r"\s+"," ",unicodedata.normalize("NFKD",str(s or "").strip().lower()).encode("ascii","ignore").decode())
def dig(x): d=re.sub(r"\D","",str(x or "")); return d or None
def slug(s): return re.sub(r"[^a-z0-9]+","_",norm(s)).strip("_")
def q(s):  # sql string literal
    return "'"+str(s).replace("'","''")+"'" if s is not None else "NULL"
def hid(*parts): return "hist_"+hashlib.md5("|".join(parts).encode()).hexdigest()[:20]

prod = json.load(open("/tmp/prod_current.json"))
by_name = {}
for r in prod:
    by_name[norm(r["name"])] = r
# existing ClassTracks: (campusId, programId, name) -> id  (reuse; composite unique key forbids dup)
existing_tracks = {}
for t in json.load(open("/tmp/existing_tracks.json")):
    existing_tracks[(t["campusId"], t["programId"], t["name"])] = t["id"]

wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)

# accumulate
ay_rows={}; track_rows={}; section_rows={}; enroll_rows=[]
coverage=defaultdict(list)         # student name -> [years]
spot_flags=[]                      # implausible older rows (excluded)
split_sections=[]                  # classes split per-campus (DECISION 2)
reused_tracks=set()                # existing track ids reused (no insert)
matched_per_year=Counter(); excluded_spot=Counter()

for sheet,(ay_id,ay_name,sy,ey,trusted) in YEARS.items():
    ws=wb[sheet]; it=ws.iter_rows(values_only=True)
    hdr=[str(c).strip() if c else "" for c in next(it)]; ix={h:i for i,h in enumerate(hdr)}
    rows=[r for r in it if r and r[ix['Nama Lengkap']] and str(r[ix['Nama Lengkap']]).strip()]
    # group matched rows by Kelas to resolve section campus
    grp=defaultdict(list)  # kelas -> list of (row, student)
    for r in rows:
        nm=norm(r[ix['Nama Lengkap']]); nm=ALIAS.get(nm,nm)
        st=by_name.get(nm)
        if not st: continue  # not a current student -> no history to attach
        kelas=str(r[ix['Kelas']]).strip() if r[ix['Kelas']] else ""
        if not kelas: continue
        grp[kelas].append((r,st,ix))
    ay_start=date(sy,7,1)
    for kelas,members in grp.items():
        prog = PROG.get(norm(members[0][0][members[0][2]['Program']]) if members[0][0][members[0][2].get('Program',-1)] else "", None) or prog_from_kelas(kelas)
        # DECISION 2 (owner): split a class per current campus rather than hold out ambiguous
        by_campus=defaultdict(list)
        for m in members: by_campus[m[1]["campus_id"]].append(m)
        split = len(by_campus)>1
        for campus_id, cmembers in by_campus.items():
            # section name campus-suffixed only when the class splits (keeps per-year name unique)
            sec_name = f"{kelas} {CAMPUS_SHORT.get(campus_id,campus_id)}" if split else kelas
            if split:
                split_sections.append({"year":ay_name,"kelas":kelas,"campus":CAMPUS_SHORT.get(campus_id,campus_id),
                                       "section":sec_name,"students":len(cmembers)})
            ay_rows[ay_id]=(ay_name,sy,ey)
            # resolve track on the BASE class name: reuse existing (campus,program,kelas) or mint new hist_
            tkey=(campus_id,prog,kelas)
            if tkey in existing_tracks:
                trk_id=existing_tracks[tkey]; reused_tracks.add(trk_id)
            else:
                trk_id=hid("trk",campus_id,prog,slug(kelas))
                track_rows[trk_id]=(campus_id,prog,kelas)
            sec_id=hid("sec",ay_id,slug(sec_name),campus_id)
            age_group="B" if kelas.strip().upper().startswith("B") else "A"
            section_rows[sec_id]=(ay_id,trk_id,prog,campus_id,sec_name,age_group)
            for (r,st,ixx) in cmembers:
                # spot-check untrusted years by age + program; excluded rows are flagged, not silent
                if not trusted and norm(st["name"]) not in FORCE_INCLUDE:
                    keep=True; reasons=[]
                    dob=st.get("dob")
                    if dob:
                        y,m,d=map(int,dob[:10].split("-"))
                        age=(ay_start-date(y,m,d)).days/365.25
                        b=band(kelas)
                        if b and not (b[0]<=age<=b[1]):
                            keep=False; reasons.append(f"age {age:.1f}y outside {b} for {kelas}")
                    else:
                        reasons.append("no DOB")
                    exp=prog_from_kelas(kelas)
                    if prog!=exp: reasons.append(f"program {prog}!=expected {exp}")
                    if not keep:
                        spot_flags.append({"year":ay_name,"student":st["name"],"kelas":kelas,
                                           "dob":dob,"reasons":reasons})
                        excluded_spot[ay_name]+=1
                        continue
                enr_id=hid("enr",st["id"],sec_id)
                enroll_rows.append((enr_id,st["id"],sec_id,f"{sy}-07-01"))
                coverage[st["name"]].append(ay_name)
            matched_per_year[ay_name]+=1
wb.close()

# ---- emit SQL ----
out=[]
out.append("-- Historical class-history backfill  (tag: %s)  ADDITIVE / IDEMPOTENT" % TAG)
out.append("-- Generated deterministically; safe to re-run (ON CONFLICT DO NOTHING).")
for ay_id,(name,sy,ey) in sorted(ay_rows.items()):
    out.append(f"""INSERT INTO "AcademicYear"(id,"tenantId",name,"startDate","endDate",status) VALUES
 ({q(ay_id)},{q(TENANT)},{q(name)},{q(f'{sy}-07-01')},{q(f'{ey}-06-30')},'INACTIVE') ON CONFLICT (id) DO NOTHING;""")
for trk_id,(cid,prog,name) in sorted(track_rows.items()):
    out.append(f"""INSERT INTO "ClassTrack"(id,"tenantId","campusId","programId",name,status) VALUES
 ({q(trk_id)},{q(TENANT)},{q(cid)},{q(prog)},{q(name)},'INACTIVE') ON CONFLICT (id) DO NOTHING;""")
for sec_id,(ay_id,trk_id,prog,cid,name,ag) in sorted(section_rows.items()):
    out.append(f"""INSERT INTO "ClassSection"(id,"tenantId","classTrackId","programId","academicYearId",name,"ageGroup",capacity,"campusId","slotTemplate",status) VALUES
 ({q(sec_id)},{q(TENANT)},{q(trk_id)},{q(prog)},{q(ay_id)},{q(name)},{q(ag)},20,{q(cid)},'FULL_DAY','INACTIVE') ON CONFLICT (id) DO NOTHING;""")
note=q(f"{TAG}; campus-inferred")
for enr_id,sid,sec_id,ed in enroll_rows:
    out.append(f"""INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ({q(enr_id)},{q(sid)},{q(sec_id)},{q(ed)},'GRADUATED',{note}) ON CONFLICT ("studentId","classSectionId") DO NOTHING;""")
sql="\n".join(out)
open("scripts/import-roster/history-import.sql","w").write(sql+"\n")

# ---- preview stats ----
stats={
 "would_insert":{"academic_years":len(ay_rows),"class_tracks_new":len(track_rows),
                 "class_tracks_reused":len(reused_tracks),
                 "class_sections":len(section_rows),"enrollments":len(enroll_rows)},
 "matched_per_year":dict(matched_per_year),
 "students_with_history":len(coverage),
 "coverage_distribution":dict(sorted(Counter(len(v) for v in coverage.values()).items())),
 "excluded_spotcheck_rows":dict(excluded_spot),
 "split_sections":split_sections,
 "spot_flags":spot_flags,
}
open("/tmp/preview_stats.json","w").write(json.dumps(stats,indent=2,ensure_ascii=False))
print(json.dumps(stats,indent=2,ensure_ascii=False))
