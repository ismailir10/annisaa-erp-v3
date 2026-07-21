-- Historical class-history backfill  (tag: histbackfill-20260721)  ADDITIVE / IDEMPOTENT
-- Generated deterministically; safe to re-run (ON CONFLICT DO NOTHING).
INSERT INTO "AcademicYear"(id,"tenantId",name,"startDate","endDate",status) VALUES
 ('hist_ay_2022_2023','tenant_annisaa','2022/2023','2022-07-01','2023-06-30','INACTIVE') ON CONFLICT (id) DO NOTHING;
INSERT INTO "AcademicYear"(id,"tenantId",name,"startDate","endDate",status) VALUES
 ('hist_ay_2023_2024','tenant_annisaa','2023/2024','2023-07-01','2024-06-30','INACTIVE') ON CONFLICT (id) DO NOTHING;
INSERT INTO "AcademicYear"(id,"tenantId",name,"startDate","endDate",status) VALUES
 ('hist_ay_2024_2025','tenant_annisaa','2024/2025','2024-07-01','2025-06-30','INACTIVE') ON CONFLICT (id) DO NOTHING;
INSERT INTO "AcademicYear"(id,"tenantId",name,"startDate","endDate",status) VALUES
 ('hist_ay_2025_2026','tenant_annisaa','2025/2026','2025-07-01','2026-06-30','INACTIVE') ON CONFLICT (id) DO NOTHING;
INSERT INTO "ClassTrack"(id,"tenantId","campusId","programId",name,status) VALUES
 ('hist_0db03efe6b00b9ff0f20','tenant_annisaa','campus_taman_aster','program_kb','KB2','INACTIVE') ON CONFLICT (id) DO NOTHING;
INSERT INTO "ClassTrack"(id,"tenantId","campusId","programId",name,status) VALUES
 ('hist_5769dc2790c96ddc8d7a','tenant_annisaa','campus_metland_cibitung','program_kb','KB2','INACTIVE') ON CONFLICT (id) DO NOTHING;
INSERT INTO "ClassTrack"(id,"tenantId","campusId","programId",name,status) VALUES
 ('hist_7817e017722f0074998a','tenant_annisaa','campus_metland_cibitung','program_dcare','TD1','INACTIVE') ON CONFLICT (id) DO NOTHING;
INSERT INTO "ClassTrack"(id,"tenantId","campusId","programId",name,status) VALUES
 ('hist_78cc05215b904bcb8df7','tenant_annisaa','campus_metland_cibitung','program_tkit','A2','INACTIVE') ON CONFLICT (id) DO NOTHING;
INSERT INTO "ClassTrack"(id,"tenantId","campusId","programId",name,status) VALUES
 ('hist_e40e586e6847c00a5ada','tenant_annisaa','campus_metland_cibitung','program_kb','KB1','INACTIVE') ON CONFLICT (id) DO NOTHING;
INSERT INTO "ClassTrack"(id,"tenantId","campusId","programId",name,status) VALUES
 ('hist_fc09ae4d42a9f2006244','tenant_annisaa','campus_taman_aster','program_kb','KB3','INACTIVE') ON CONFLICT (id) DO NOTHING;
INSERT INTO "ClassSection"(id,"tenantId","classTrackId","programId","academicYearId",name,"ageGroup",capacity,"campusId","slotTemplate",status) VALUES
 ('hist_06991f10b2dc5ebe1391','tenant_annisaa','hist_e40e586e6847c00a5ada','program_kb','hist_ay_2023_2024','KB1','A',20,'campus_metland_cibitung','FULL_DAY','INACTIVE') ON CONFLICT (id) DO NOTHING;
INSERT INTO "ClassSection"(id,"tenantId","classTrackId","programId","academicYearId",name,"ageGroup",capacity,"campusId","slotTemplate",status) VALUES
 ('hist_12a659fc83d85721f484','tenant_annisaa','cmrm7s91j020804k6m039b65u','program_tkit','hist_ay_2025_2026','B3','B',20,'campus_metland_cibitung','FULL_DAY','INACTIVE') ON CONFLICT (id) DO NOTHING;
INSERT INTO "ClassSection"(id,"tenantId","classTrackId","programId","academicYearId",name,"ageGroup",capacity,"campusId","slotTemplate",status) VALUES
 ('hist_14dc1f164e39f07e972e','tenant_annisaa','cmrm78go500eg04k6qr6xlbon','program_kb','hist_ay_2025_2026','KB1','A',20,'campus_taman_aster','FULL_DAY','INACTIVE') ON CONFLICT (id) DO NOTHING;
INSERT INTO "ClassSection"(id,"tenantId","classTrackId","programId","academicYearId",name,"ageGroup",capacity,"campusId","slotTemplate",status) VALUES
 ('hist_21f018bab9b95e043b23','tenant_annisaa','trk_bayi_6_12','program_dcare','hist_ay_2025_2026','Bayi 6-12 Bulan','B',20,'campus_metland_cibitung','FULL_DAY','INACTIVE') ON CONFLICT (id) DO NOTHING;
INSERT INTO "ClassSection"(id,"tenantId","classTrackId","programId","academicYearId",name,"ageGroup",capacity,"campusId","slotTemplate",status) VALUES
 ('hist_278f46ae5ea72ae1cef9','tenant_annisaa','cmrm7u6q4027g04k6ykxpm88z','program_tkit','hist_ay_2025_2026','B4','B',20,'campus_metland_cibitung','FULL_DAY','INACTIVE') ON CONFLICT (id) DO NOTHING;
INSERT INTO "ClassSection"(id,"tenantId","classTrackId","programId","academicYearId",name,"ageGroup",capacity,"campusId","slotTemplate",status) VALUES
 ('hist_378a4f3db64a75f18266','tenant_annisaa','hist_fc09ae4d42a9f2006244','program_kb','hist_ay_2023_2024','KB3','A',20,'campus_taman_aster','FULL_DAY','INACTIVE') ON CONFLICT (id) DO NOTHING;
INSERT INTO "ClassSection"(id,"tenantId","classTrackId","programId","academicYearId",name,"ageGroup",capacity,"campusId","slotTemplate",status) VALUES
 ('hist_3adc18318298f019e8dd','tenant_annisaa','hist_0db03efe6b00b9ff0f20','program_kb','hist_ay_2023_2024','KB2 Aster','A',20,'campus_taman_aster','FULL_DAY','INACTIVE') ON CONFLICT (id) DO NOTHING;
INSERT INTO "ClassSection"(id,"tenantId","classTrackId","programId","academicYearId",name,"ageGroup",capacity,"campusId","slotTemplate",status) VALUES
 ('hist_684ba6337bdfec670f2f','tenant_annisaa','cmrm740v8000004k6vwf31fqo','program_dcare','hist_ay_2024_2025','TD1','A',20,'campus_taman_aster','FULL_DAY','INACTIVE') ON CONFLICT (id) DO NOTHING;
INSERT INTO "ClassSection"(id,"tenantId","classTrackId","programId","academicYearId",name,"ageGroup",capacity,"campusId","slotTemplate",status) VALUES
 ('hist_690ba677cff9b5590b6d','tenant_annisaa','cmrm75exf007804k6rv032zie','program_dcare','hist_ay_2025_2026','TD2','A',20,'campus_metland_cibitung','FULL_DAY','INACTIVE') ON CONFLICT (id) DO NOTHING;
INSERT INTO "ClassSection"(id,"tenantId","classTrackId","programId","academicYearId",name,"ageGroup",capacity,"campusId","slotTemplate",status) VALUES
 ('hist_6ff3888e1beff164fe79','tenant_annisaa','hist_5769dc2790c96ddc8d7a','program_kb','hist_ay_2023_2024','KB2 Metland','A',20,'campus_metland_cibitung','FULL_DAY','INACTIVE') ON CONFLICT (id) DO NOTHING;
INSERT INTO "ClassSection"(id,"tenantId","classTrackId","programId","academicYearId",name,"ageGroup",capacity,"campusId","slotTemplate",status) VALUES
 ('hist_7e27210134f49b93ee26','tenant_annisaa','cmrm78go500eg04k6qr6xlbon','program_kb','hist_ay_2024_2025','KB1','A',20,'campus_taman_aster','FULL_DAY','INACTIVE') ON CONFLICT (id) DO NOTHING;
INSERT INTO "ClassSection"(id,"tenantId","classTrackId","programId","academicYearId",name,"ageGroup",capacity,"campusId","slotTemplate",status) VALUES
 ('hist_844737b202366ff97eeb','tenant_annisaa','trk_bayi_1_2','program_dcare','hist_ay_2025_2026','Bayi 1-2 Tahun','B',20,'campus_metland_cibitung','FULL_DAY','INACTIVE') ON CONFLICT (id) DO NOTHING;
INSERT INTO "ClassSection"(id,"tenantId","classTrackId","programId","academicYearId",name,"ageGroup",capacity,"campusId","slotTemplate",status) VALUES
 ('hist_8bdca37ba9887ebed7c3','tenant_annisaa','cmrm7asuz00lo04k6iblkaltj','program_kb','hist_ay_2024_2025','KB3','A',20,'campus_metland_cibitung','FULL_DAY','INACTIVE') ON CONFLICT (id) DO NOTHING;
INSERT INTO "ClassSection"(id,"tenantId","classTrackId","programId","academicYearId",name,"ageGroup",capacity,"campusId","slotTemplate",status) VALUES
 ('hist_8c6ea18e1f8f1bcb9c5d','tenant_annisaa','cmrm7gy2j017c04k627ofzqu3','program_tkit','hist_ay_2025_2026','A2','A',20,'campus_taman_aster','FULL_DAY','INACTIVE') ON CONFLICT (id) DO NOTHING;
INSERT INTO "ClassSection"(id,"tenantId","classTrackId","programId","academicYearId",name,"ageGroup",capacity,"campusId","slotTemplate",status) VALUES
 ('hist_8c858711188e812a7d36','tenant_annisaa','cmrm7pvak000004kthao0z7wk','program_tkit','hist_ay_2025_2026','B2','B',20,'campus_taman_aster','FULL_DAY','INACTIVE') ON CONFLICT (id) DO NOTHING;
INSERT INTO "ClassSection"(id,"tenantId","classTrackId","programId","academicYearId",name,"ageGroup",capacity,"campusId","slotTemplate",status) VALUES
 ('hist_8c8873fd6123ae155658','tenant_annisaa','cmrm7kv0b01ls04k6rj0j1mr4','program_tkit','hist_ay_2025_2026','A4','A',20,'campus_metland_cibitung','FULL_DAY','INACTIVE') ON CONFLICT (id) DO NOTHING;
INSERT INTO "ClassSection"(id,"tenantId","classTrackId","programId","academicYearId",name,"ageGroup",capacity,"campusId","slotTemplate",status) VALUES
 ('hist_9c55808757eb7b54eb65','tenant_annisaa','cmrm7f5vk010404k6338xzi9l','program_tkit','hist_ay_2024_2025','A1','A',20,'campus_taman_aster','FULL_DAY','INACTIVE') ON CONFLICT (id) DO NOTHING;
INSERT INTO "ClassSection"(id,"tenantId","classTrackId","programId","academicYearId",name,"ageGroup",capacity,"campusId","slotTemplate",status) VALUES
 ('hist_9f433997ea742309a6a0','tenant_annisaa','cmrm7cqh700sw04k6kqs67kyb','program_kb','hist_ay_2025_2026','KB4','A',20,'campus_metland_cibitung','FULL_DAY','INACTIVE') ON CONFLICT (id) DO NOTHING;
INSERT INTO "ClassSection"(id,"tenantId","classTrackId","programId","academicYearId",name,"ageGroup",capacity,"campusId","slotTemplate",status) VALUES
 ('hist_b2e4d669248159834283','tenant_annisaa','cmrm7asuz00lo04k6iblkaltj','program_kb','hist_ay_2025_2026','KB3','A',20,'campus_metland_cibitung','FULL_DAY','INACTIVE') ON CONFLICT (id) DO NOTHING;
INSERT INTO "ClassSection"(id,"tenantId","classTrackId","programId","academicYearId",name,"ageGroup",capacity,"campusId","slotTemplate",status) VALUES
 ('hist_b37a9dfc3ac1656a1315','tenant_annisaa','cmrm7irti01ek04k6qu83vu1y','program_tkit','hist_ay_2024_2025','A3','A',20,'campus_metland_cibitung','FULL_DAY','INACTIVE') ON CONFLICT (id) DO NOTHING;
INSERT INTO "ClassSection"(id,"tenantId","classTrackId","programId","academicYearId",name,"ageGroup",capacity,"campusId","slotTemplate",status) VALUES
 ('hist_b995b079605c32519041','tenant_annisaa','cmrm7f5vk010404k6338xzi9l','program_tkit','hist_ay_2025_2026','A1','A',20,'campus_taman_aster','FULL_DAY','INACTIVE') ON CONFLICT (id) DO NOTHING;
INSERT INTO "ClassSection"(id,"tenantId","classTrackId","programId","academicYearId",name,"ageGroup",capacity,"campusId","slotTemplate",status) VALUES
 ('hist_b99f758697e3a92157be','tenant_annisaa','hist_78cc05215b904bcb8df7','program_tkit','hist_ay_2024_2025','A2 Metland','A',20,'campus_metland_cibitung','FULL_DAY','INACTIVE') ON CONFLICT (id) DO NOTHING;
INSERT INTO "ClassSection"(id,"tenantId","classTrackId","programId","academicYearId",name,"ageGroup",capacity,"campusId","slotTemplate",status) VALUES
 ('hist_b9db72fde549ccb784bf','tenant_annisaa','cmrm740v8000004k6vwf31fqo','program_dcare','hist_ay_2023_2024','TD1','A',20,'campus_taman_aster','FULL_DAY','INACTIVE') ON CONFLICT (id) DO NOTHING;
INSERT INTO "ClassSection"(id,"tenantId","classTrackId","programId","academicYearId",name,"ageGroup",capacity,"campusId","slotTemplate",status) VALUES
 ('hist_e06e69c1c1e8f21606ae','tenant_annisaa','cmrm7irti01ek04k6qu83vu1y','program_tkit','hist_ay_2025_2026','A3','A',20,'campus_metland_cibitung','FULL_DAY','INACTIVE') ON CONFLICT (id) DO NOTHING;
INSERT INTO "ClassSection"(id,"tenantId","classTrackId","programId","academicYearId",name,"ageGroup",capacity,"campusId","slotTemplate",status) VALUES
 ('hist_e5377e8f76aa0ea0b95f','tenant_annisaa','cmrm740v8000004k6vwf31fqo','program_dcare','hist_ay_2022_2023','TD1 Aster','A',20,'campus_taman_aster','FULL_DAY','INACTIVE') ON CONFLICT (id) DO NOTHING;
INSERT INTO "ClassSection"(id,"tenantId","classTrackId","programId","academicYearId",name,"ageGroup",capacity,"campusId","slotTemplate",status) VALUES
 ('hist_e89b6108afe6160d7dc7','tenant_annisaa','hist_7817e017722f0074998a','program_dcare','hist_ay_2022_2023','TD1 Metland','A',20,'campus_metland_cibitung','FULL_DAY','INACTIVE') ON CONFLICT (id) DO NOTHING;
INSERT INTO "ClassSection"(id,"tenantId","classTrackId","programId","academicYearId",name,"ageGroup",capacity,"campusId","slotTemplate",status) VALUES
 ('hist_e9ed7b1801532b9162ea','tenant_annisaa','cmrm7kv0b01ls04k6rj0j1mr4','program_tkit','hist_ay_2024_2025','A4','A',20,'campus_metland_cibitung','FULL_DAY','INACTIVE') ON CONFLICT (id) DO NOTHING;
INSERT INTO "ClassSection"(id,"tenantId","classTrackId","programId","academicYearId",name,"ageGroup",capacity,"campusId","slotTemplate",status) VALUES
 ('hist_ec03071bafb7325e2f21','tenant_annisaa','cmrm7n4w101t004k6ujnluvyq','program_tkit','hist_ay_2025_2026','B1','B',20,'campus_taman_aster','FULL_DAY','INACTIVE') ON CONFLICT (id) DO NOTHING;
INSERT INTO "ClassSection"(id,"tenantId","classTrackId","programId","academicYearId",name,"ageGroup",capacity,"campusId","slotTemplate",status) VALUES
 ('hist_ec6632a10523f2dba288','tenant_annisaa','cmrm7gy2j017c04k627ofzqu3','program_tkit','hist_ay_2024_2025','A2 Aster','A',20,'campus_taman_aster','FULL_DAY','INACTIVE') ON CONFLICT (id) DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_59a5dc63207268bf10c7','imp_c83cb6ceb884b00d40e7','hist_844737b202366ff97eeb','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_ca37123869ae71db8534','imp_9734900c787a4c31dcd4','hist_844737b202366ff97eeb','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_9d8399b72a2b649e44b5','imp_c919122caf53c6e27d57','hist_21f018bab9b95e043b23','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_d829a8c6cf913f910537','imp_4623b66443fdc18af9ab','hist_21f018bab9b95e043b23','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_1aa6cd4a20ab71a8aac1','imp_5ad00c662204c411ca01','hist_21f018bab9b95e043b23','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_15a261435c8cf15bebe3','imp_f7034eeb013eb174f6de','hist_690ba677cff9b5590b6d','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_19336b16488262ffcc04','imp_36e624757da26c8ce786','hist_690ba677cff9b5590b6d','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_bf0d5753f75199796fcd','imp_3ea7703048bb36c7e035','hist_690ba677cff9b5590b6d','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_c6ef220b691a143a0413','imp_95be507ab3f0ea0896fd','hist_690ba677cff9b5590b6d','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_cd1c4c53b35f4fce0402','imp_e9b24e6c75958dbe1499','hist_14dc1f164e39f07e972e','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_c01c6f987a9d7011fa09','imp_6c17a23fac9b07fc289e','hist_14dc1f164e39f07e972e','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_6f18383a1dcf9a06d76d','imp_b4324e968fc3bad208ef','hist_14dc1f164e39f07e972e','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_16e34fc3cfd58d3ecd80','imp_3daad13c684b827f42a0','hist_14dc1f164e39f07e972e','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_29e789a742256589db41','imp_0b217e54fc6d244ae1b3','hist_14dc1f164e39f07e972e','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_ff9e57d71bdf66740ff9','imp_6a328af6b486c2288f93','hist_14dc1f164e39f07e972e','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_bb43a242f02fa3c0e695','imp_a3d7c34727ba621e09e1','hist_14dc1f164e39f07e972e','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_235f181436969d2ce54f','imp_63341ed3b59eb4d523e0','hist_14dc1f164e39f07e972e','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_1eefbf6b4f3609343337','imp_75cfc56f593915e3f906','hist_b2e4d669248159834283','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_a99cc517e485d52c9b89','imp_b823929dd51a3a765ce6','hist_b2e4d669248159834283','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_755b2ccc64ee845523d2','imp_e19cc8c5460db61ae104','hist_b2e4d669248159834283','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_e024bf6ac3a88abb07f0','imp_917f371f2c65631ac3b6','hist_b2e4d669248159834283','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_a6c48106dc5b2ac45d6e','imp_0c3c2d9b36b18454ad7f','hist_b2e4d669248159834283','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_cdc25dfa343c0e0686f6','imp_38441b5eb5e9ae711ec7','hist_b2e4d669248159834283','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_75d319857200defc5c23','imp_159ab1cd430d2125c35e','hist_b2e4d669248159834283','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_9086f5b7740b6db06438','imp_43453d355e94d6cc6d45','hist_b2e4d669248159834283','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_446549d02cc5195e2b7f','imp_454dc2a839f9ab36b02e','hist_9f433997ea742309a6a0','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_d20c88625dcddc817358','imp_c066cd94e1dd00c9df01','hist_9f433997ea742309a6a0','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_1e0de662d9c1dd4ae7f0','imp_ad84bc83934e1c9bb8e4','hist_9f433997ea742309a6a0','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_4d5e906d5d1328976a0d','imp_1a08c86e73507895d4c7','hist_9f433997ea742309a6a0','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_5b38066edf26837fb677','imp_598e6474e4c206ff36aa','hist_9f433997ea742309a6a0','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_5feb889b1b5353b9e950','imp_de07ec17dede26f4e5e6','hist_9f433997ea742309a6a0','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_380064acdaae913baa9a','imp_f27c0b8bc1ff0076b3b3','hist_9f433997ea742309a6a0','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_5d7009df0549d13ab557','imp_63ee65b5daeedd2e9c1a','hist_9f433997ea742309a6a0','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_7008677134661b073f76','imp_737cb425f05cb1abb353','hist_b995b079605c32519041','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_14310a974fd0f078a14d','imp_4b64b8a6056546ca19ea','hist_b995b079605c32519041','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_2f007da0299a8f4f2961','imp_813a559ced0f44c43447','hist_b995b079605c32519041','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_3c57f1d62fdb71cb318b','imp_b153caa480dd71949020','hist_b995b079605c32519041','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_4d8d291ec2aaa0c0cbf0','imp_6f0c08094a1a40008bb1','hist_b995b079605c32519041','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_e601206ef0b6749a67b1','imp_9b225006420f30d0e221','hist_b995b079605c32519041','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_bade67077e65745a4fbd','imp_dfb92ddbbacd868790aa','hist_b995b079605c32519041','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_c2bb5a6b2458b7a304d7','imp_cd6248ac4672c0794281','hist_b995b079605c32519041','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_a6d8c43e7a4931a4653c','imp_a06eb660d31e3ad1c38c','hist_b995b079605c32519041','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_87580608bf991e338444','imp_ebf22dd353a6b24f74c5','hist_b995b079605c32519041','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_44e9c75b3e9d02ecd34d','imp_dcaa480db8be1377cd19','hist_8c6ea18e1f8f1bcb9c5d','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_72f49df034f15aa2b640','imp_1b13e9d2909d10e2aaa1','hist_8c6ea18e1f8f1bcb9c5d','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_1d308ac25c6ec23d3cbd','imp_af4cd50b088141e23de9','hist_8c6ea18e1f8f1bcb9c5d','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_38a694b3debc7992b57b','imp_4ec6a9e7e51df1558529','hist_8c6ea18e1f8f1bcb9c5d','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_60b426eb6f5e69000507','imp_c5e041c3d97478ca50c9','hist_8c6ea18e1f8f1bcb9c5d','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_ddc05a9277c7217a2ed2','imp_9fadc15a8378c5cf968d','hist_8c6ea18e1f8f1bcb9c5d','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_b0e111d4062efe9938c6','imp_fb11da368475e31f9607','hist_8c6ea18e1f8f1bcb9c5d','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_188b852a253d266dfa3b','imp_9cbb0e9e711f991590fe','hist_8c6ea18e1f8f1bcb9c5d','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_8eeb133369a02a57f7f4','imp_56b23eb3bcf3905c838f','hist_8c6ea18e1f8f1bcb9c5d','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_5b49d81e039bb18a68aa','imp_2056aba9f3db0082bc5c','hist_8c6ea18e1f8f1bcb9c5d','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_fed45b86542e59fbf3a5','imp_bdaaf37a80bab4ccdbb5','hist_e06e69c1c1e8f21606ae','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_0b052ff573011f193941','imp_5832819523269f543188','hist_e06e69c1c1e8f21606ae','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_28d65e0ddc3c5cc32f3f','imp_ee58e32ce56d448f564a','hist_e06e69c1c1e8f21606ae','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_aa5cde11d6fe13d49ca9','imp_26a305b0241306ef0b2c','hist_e06e69c1c1e8f21606ae','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_a5c88b50e4f765418864','imp_f86bf3ea5cdad4ed83e1','hist_e06e69c1c1e8f21606ae','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_c0ed0a42cce723d33189','imp_d0be4fbb8c52da5c55c2','hist_e06e69c1c1e8f21606ae','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_d22023c6d7f6ff42c0a1','imp_84c5b16399d3b9edfb8c','hist_e06e69c1c1e8f21606ae','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_0b5295fd94e4ec4f380b','imp_8961dff3a3ba195fdc8f','hist_e06e69c1c1e8f21606ae','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_ce7f79a99ebe66daaa99','imp_d68bb4d3b3d51f667d55','hist_e06e69c1c1e8f21606ae','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_0d15d19acb3612c11370','imp_204fb06a9444b320245f','hist_e06e69c1c1e8f21606ae','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_dcbfcfcb1fc0d03b2588','imp_f43542c3f627b1716ec6','hist_e06e69c1c1e8f21606ae','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_6ebb160173fbdb8fff3a','imp_3abb4c3cdac37ad56959','hist_8c8873fd6123ae155658','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_8a8a338663a9ff094083','imp_1595d4bae48b20767be4','hist_8c8873fd6123ae155658','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_930fcc8a171974c36250','imp_507d349c118bf0c5959a','hist_8c8873fd6123ae155658','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_522e52b923c5484b345f','imp_4260d75ccd0973525b25','hist_8c8873fd6123ae155658','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_0323b40b07424d21fdf3','imp_acf9275a35ce054f947e','hist_8c8873fd6123ae155658','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_26adf4acbbbc539d156a','imp_9f08c2171d4668f64706','hist_8c8873fd6123ae155658','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_70eaf8a450dd6e242a79','imp_11f42b52cdb151173d3f','hist_8c8873fd6123ae155658','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_961faae9e88df9e05109','imp_44c4c5cae439b9ef04f2','hist_8c8873fd6123ae155658','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_361790ac4d25e5f4f805','imp_08b098a98368e8cc7f95','hist_8c8873fd6123ae155658','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_1e580b6eb3c9461ddbe6','imp_8e9b989b37659b920fba','hist_8c8873fd6123ae155658','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_d94813745e61bc6fb8b5','imp_fbfb66e4b728317678bf','hist_8c8873fd6123ae155658','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_ab5a1e4e9b01fc2961da','imp_fb75ede1e0ab7b35f4fe','hist_8c8873fd6123ae155658','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_b11c2d3f0bc2ffbf5fc1','imp_632ebbf9ad8708153d25','hist_ec03071bafb7325e2f21','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_6f1e8470759c84adacde','imp_5834bfc991fc9deadb76','hist_ec03071bafb7325e2f21','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_82c56aa9d2127a27a657','imp_4883fcf03c09b5d82f29','hist_ec03071bafb7325e2f21','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_053d5739c025ea289f29','imp_f47db10ad7c8048a50cb','hist_ec03071bafb7325e2f21','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_80f2cb30bea0b1330ff6','imp_e224f29300614e5f8f7b','hist_ec03071bafb7325e2f21','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_13e027692aba7782b064','imp_d9699809fd94ae0f8340','hist_ec03071bafb7325e2f21','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_cb59e965a9bd150d9585','imp_284100dbb7c764dd397e','hist_ec03071bafb7325e2f21','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_12d7ab4362780af01a2f','imp_8dc3f0c566415ccdbb06','hist_ec03071bafb7325e2f21','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_9e913da9fc49a37c9aa8','imp_9439b25ec65a0b718099','hist_ec03071bafb7325e2f21','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_b21268d7f07484756bfc','imp_40f2489ffe64f121afb4','hist_ec03071bafb7325e2f21','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_9b3c6d97a8113e5ac640','imp_5743cba896fb6fcf16bb','hist_ec03071bafb7325e2f21','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_6ceff1f646cb27ed7669','imp_45b692d8488a57d26117','hist_ec03071bafb7325e2f21','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_4a5f73a4b15fb7d5ca27','imp_9867c74da183db9c2682','hist_ec03071bafb7325e2f21','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_2ff85659589fa306c44d','imp_36931d710d0f1dfd8c8e','hist_8c858711188e812a7d36','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_bb37715854f275eaf787','imp_298f5da15a4103ae60b6','hist_8c858711188e812a7d36','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_ce1bf75c358faa979e93','imp_ab8989a41113177d681f','hist_8c858711188e812a7d36','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_06d8913e7f8e36134ce8','imp_ca24f522415610520a37','hist_8c858711188e812a7d36','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_2757dba47344e878d597','imp_825cc7d2f6adb791eaf1','hist_8c858711188e812a7d36','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_21934d045152ff84df1e','imp_8c1ea8f6dc6f48f13ccc','hist_8c858711188e812a7d36','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_763e2589ebaf45e68a43','imp_b795702a53e0f3aaeda5','hist_8c858711188e812a7d36','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_92c3ee469b1f80e3fef4','imp_3e996e74167232fa8b17','hist_8c858711188e812a7d36','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_db440f4c8c40eb609f46','imp_2c5d77441f31163c9a12','hist_8c858711188e812a7d36','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_b175c3a9f21b33f4d84f','imp_f73c1b3a7c4e65b8d341','hist_8c858711188e812a7d36','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_1f235f14aeb54a5d29a5','imp_b9a2c9eaca0c3fc97331','hist_8c858711188e812a7d36','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_382a1794389222cd4e94','imp_3396cf54baf02abf3d74','hist_8c858711188e812a7d36','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_85903171db18f115e9fd','imp_5523e5cf6fcc270fcaa7','hist_8c858711188e812a7d36','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_63d54e5356f58c920731','imp_96c86b6675d853af6c93','hist_8c858711188e812a7d36','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_d537a63f71fee3603101','imp_394d044a52376f402f93','hist_12a659fc83d85721f484','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_6c3113327592657abc2f','imp_7108cdbc2c22c5ec8d22','hist_12a659fc83d85721f484','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_449c81fac688c588dfb0','imp_f8cafbc49be3abc849e6','hist_12a659fc83d85721f484','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_0b6efc4a64f4d93674cd','imp_3165e753479694bb5daf','hist_12a659fc83d85721f484','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_bdc1558989e61570cdc7','imp_8ce6d9902f3b77c3641d','hist_12a659fc83d85721f484','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_73dc839c7e296c5335d0','imp_bf0e686ef7790d0ea4db','hist_12a659fc83d85721f484','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_faf686ab02aa23e9bfab','imp_09b1fc76e9b512af4d19','hist_12a659fc83d85721f484','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_af702940ff68e6999a32','imp_b59fe84ab125e67a6509','hist_12a659fc83d85721f484','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_13664f0ebabf0fd37079','imp_cd68ac2019ad0ccaaf38','hist_12a659fc83d85721f484','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_2f2866a16cefce3209a8','imp_bfe0e9f42d7248267f31','hist_12a659fc83d85721f484','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_c64b66c44205f1837f73','imp_79892fde644ad796802f','hist_12a659fc83d85721f484','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_444c9fb3edfbe4aae990','imp_da8f63af54012287de00','hist_12a659fc83d85721f484','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_2a4fb82840712b49d634','imp_4cdcefdf025a4a706aa6','hist_12a659fc83d85721f484','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_6d9973a51cc121ea4f7b','imp_aa291611779ae9b6937f','hist_278f46ae5ea72ae1cef9','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_d3ad5ddb598509a26069','imp_8d984a8279c12f66c5de','hist_278f46ae5ea72ae1cef9','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_0fd30ffd626b02008697','imp_7a6275dd6192c1bb524d','hist_278f46ae5ea72ae1cef9','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_45d13875e8b54cb6f08c','imp_08704ce560648292c8b3','hist_278f46ae5ea72ae1cef9','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_4358952584766b0310a7','imp_ff4818af3447b533e1f3','hist_278f46ae5ea72ae1cef9','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_b390a2bb0048a94bb013','imp_34ad0fc4dc572e169a2d','hist_278f46ae5ea72ae1cef9','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_76ec347f8ad639cc5e4e','imp_61b10e79a161eec5dc97','hist_278f46ae5ea72ae1cef9','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_03bb42417b034cb69b4b','imp_c1ffd0c1c4cb3c11a7f0','hist_278f46ae5ea72ae1cef9','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_a01c180c8c2921ef4b91','imp_58207d03535a1929dfb6','hist_278f46ae5ea72ae1cef9','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_5add1082f538f053a329','imp_112a3b773500af8b2b6d','hist_278f46ae5ea72ae1cef9','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_0d2303b69017b31ffd3a','imp_1ba7278df9e04d6d630b','hist_278f46ae5ea72ae1cef9','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_3f418518c31d0492841e','imp_6531eb84913aa2eb531a','hist_278f46ae5ea72ae1cef9','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_5e1bb000f50a3b94d8d3','imp_23af3782f74d34a69294','hist_278f46ae5ea72ae1cef9','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_4c79a130977fa4e7c6c7','imp_878d55be2ed34aad6626','hist_278f46ae5ea72ae1cef9','2025-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_0007363096bb83bb5fbd','imp_e9b24e6c75958dbe1499','hist_684ba6337bdfec670f2f','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_9c4fc455957d43a16b8b','imp_6c17a23fac9b07fc289e','hist_684ba6337bdfec670f2f','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_99335f47b03f159dea1e','imp_b4324e968fc3bad208ef','hist_684ba6337bdfec670f2f','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_a519615cf66b4516a1e8','imp_3daad13c684b827f42a0','hist_684ba6337bdfec670f2f','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_517584b7344c8e9d5337','imp_0b217e54fc6d244ae1b3','hist_684ba6337bdfec670f2f','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_7019caa9819730ad70a0','imp_4b64b8a6056546ca19ea','hist_7e27210134f49b93ee26','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_a7749369fa35ed4a6aca','imp_9fadc15a8378c5cf968d','hist_7e27210134f49b93ee26','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_655b8565a16edc5d4425','imp_9cbb0e9e711f991590fe','hist_7e27210134f49b93ee26','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_21e6c3c36e3139a0ea3f','imp_cd6248ac4672c0794281','hist_7e27210134f49b93ee26','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_5fb491d8e036b33cda7b','imp_a06eb660d31e3ad1c38c','hist_7e27210134f49b93ee26','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_4f0e57ccc1d668bfc852','imp_1595d4bae48b20767be4','hist_8bdca37ba9887ebed7c3','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_b3e4666b21441b2b34c7','imp_507d349c118bf0c5959a','hist_8bdca37ba9887ebed7c3','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_12ba6f49482a934c799a','imp_4260d75ccd0973525b25','hist_8bdca37ba9887ebed7c3','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_c0e1ccdf08dd21daa88e','imp_ee58e32ce56d448f564a','hist_8bdca37ba9887ebed7c3','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_c0b53d2ff71049582868','imp_8961dff3a3ba195fdc8f','hist_8bdca37ba9887ebed7c3','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_b450dbbdb31ca20d685d','imp_36931d710d0f1dfd8c8e','hist_9c55808757eb7b54eb65','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_d52573fd1429abd14e2a','imp_5834bfc991fc9deadb76','hist_9c55808757eb7b54eb65','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_a4afe6c48240de32fefb','imp_f47db10ad7c8048a50cb','hist_9c55808757eb7b54eb65','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_5062e48cefc640026a11','imp_e224f29300614e5f8f7b','hist_9c55808757eb7b54eb65','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_38abfc86e20215a1348a','imp_8c1ea8f6dc6f48f13ccc','hist_9c55808757eb7b54eb65','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_3c2a3a7d4d04e5c1c404','imp_ebf22dd353a6b24f74c5','hist_9c55808757eb7b54eb65','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_9960783272a442d2f572','imp_3e996e74167232fa8b17','hist_9c55808757eb7b54eb65','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_dcc72e503f54c8e8ec88','imp_3396cf54baf02abf3d74','hist_9c55808757eb7b54eb65','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_7889a7f64d5a501c9d78','imp_96c86b6675d853af6c93','hist_9c55808757eb7b54eb65','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_f23de7c3eae1bd80867c','imp_8dc3f0c566415ccdbb06','hist_9c55808757eb7b54eb65','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_e2101491db552b4ab932','imp_aa291611779ae9b6937f','hist_b99f758697e3a92157be','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_ce537c8a13105abe3bd5','imp_632ebbf9ad8708153d25','hist_ec6632a10523f2dba288','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_1231b4652e3dd6c79e1a','imp_825cc7d2f6adb791eaf1','hist_ec6632a10523f2dba288','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_087d06036a61afae46e2','imp_4883fcf03c09b5d82f29','hist_ec6632a10523f2dba288','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_9e2b8f91fb41c0acfa13','imp_d9699809fd94ae0f8340','hist_ec6632a10523f2dba288','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_5f2a0ff0a957341f20bf','imp_b795702a53e0f3aaeda5','hist_ec6632a10523f2dba288','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_8debe276bfe8b83fabd3','imp_2c5d77441f31163c9a12','hist_ec6632a10523f2dba288','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_05526502a773979c7635','imp_b9a2c9eaca0c3fc97331','hist_ec6632a10523f2dba288','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_64c6c9019a0d12383f17','imp_284100dbb7c764dd397e','hist_ec6632a10523f2dba288','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_b21b7f7e0d5aa6256b9e','imp_394d044a52376f402f93','hist_b37a9dfc3ac1656a1315','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_15582d0ba2220486c8fd','imp_8d984a8279c12f66c5de','hist_b37a9dfc3ac1656a1315','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_b021b250f90d87df3b31','imp_ff4818af3447b533e1f3','hist_b37a9dfc3ac1656a1315','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_2b1b1600daf7ef204b5b','imp_34ad0fc4dc572e169a2d','hist_b37a9dfc3ac1656a1315','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_9f22c3d766e28806606c','imp_61b10e79a161eec5dc97','hist_b37a9dfc3ac1656a1315','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_2202a4aa2d22c6427c31','imp_58207d03535a1929dfb6','hist_b37a9dfc3ac1656a1315','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_c24c068944e5033c4f4b','imp_112a3b773500af8b2b6d','hist_b37a9dfc3ac1656a1315','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_9f245b5a4b0f23bce1eb','imp_6531eb84913aa2eb531a','hist_b37a9dfc3ac1656a1315','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_3475050d6fccef9a77ea','imp_8ce6d9902f3b77c3641d','hist_b37a9dfc3ac1656a1315','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_78efde2e71df6402bccb','imp_bf0e686ef7790d0ea4db','hist_b37a9dfc3ac1656a1315','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_d7e2a7455bf7f60f9deb','imp_09b1fc76e9b512af4d19','hist_b37a9dfc3ac1656a1315','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_2de5c45b8ae1dacf6aa1','imp_b59fe84ab125e67a6509','hist_b37a9dfc3ac1656a1315','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_3cd41602bb1e6221fa97','imp_bfe0e9f42d7248267f31','hist_b37a9dfc3ac1656a1315','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_aafdb987e9458199199d','imp_4cdcefdf025a4a706aa6','hist_b37a9dfc3ac1656a1315','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_a6941cf7fd8db105fc78','imp_7a6275dd6192c1bb524d','hist_e9ed7b1801532b9162ea','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_66ee8674ad25e00129a5','imp_08704ce560648292c8b3','hist_e9ed7b1801532b9162ea','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_2ecb8b77b9b330c019a4','imp_7108cdbc2c22c5ec8d22','hist_e9ed7b1801532b9162ea','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_3a8e4b2b98ec19f18a79','imp_f8cafbc49be3abc849e6','hist_e9ed7b1801532b9162ea','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_e02a16eb6f3b481e107f','imp_c1ffd0c1c4cb3c11a7f0','hist_e9ed7b1801532b9162ea','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_c36785cd0ccb4154924b','imp_3165e753479694bb5daf','hist_e9ed7b1801532b9162ea','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_0e618e0105e37725d9f8','imp_1ba7278df9e04d6d630b','hist_e9ed7b1801532b9162ea','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_9ad8241b10f3b299c699','imp_23af3782f74d34a69294','hist_e9ed7b1801532b9162ea','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_072d8845cabea8422027','imp_cd68ac2019ad0ccaaf38','hist_e9ed7b1801532b9162ea','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_8d6c594d0c24c32b62f7','imp_24d1569de3382672f984','hist_e9ed7b1801532b9162ea','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_5374d584b8e00d49cc82','imp_79892fde644ad796802f','hist_e9ed7b1801532b9162ea','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_822b0fae4bf1d6d06404','imp_878d55be2ed34aad6626','hist_e9ed7b1801532b9162ea','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_9169645cbf617cad5d9c','imp_da8f63af54012287de00','hist_e9ed7b1801532b9162ea','2024-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_49f175ca8db04253a47b','imp_4b64b8a6056546ca19ea','hist_b9db72fde549ccb784bf','2023-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_562a1ae4483965423c08','imp_a06eb660d31e3ad1c38c','hist_b9db72fde549ccb784bf','2023-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_6f335cb2cd75d42136e6','imp_7a6275dd6192c1bb524d','hist_06991f10b2dc5ebe1391','2023-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_8249aea57cc4d277054c','imp_394d044a52376f402f93','hist_06991f10b2dc5ebe1391','2023-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_009a8299cb938a2b40c4','imp_34ad0fc4dc572e169a2d','hist_06991f10b2dc5ebe1391','2023-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_74ed53e636bb1f052872','imp_08704ce560648292c8b3','hist_06991f10b2dc5ebe1391','2023-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_37ac8d839ec62d0c0052','imp_ff4818af3447b533e1f3','hist_6ff3888e1beff164fe79','2023-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_0a058a2c5d065394a6eb','imp_bf0e686ef7790d0ea4db','hist_6ff3888e1beff164fe79','2023-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_08e386089d67e3118476','imp_24d1569de3382672f984','hist_6ff3888e1beff164fe79','2023-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_19fcc50b0483e503d902','imp_aa291611779ae9b6937f','hist_6ff3888e1beff164fe79','2023-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_782c14ee46de1d15a23e','imp_f47db10ad7c8048a50cb','hist_3adc18318298f019e8dd','2023-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_ee3b59c1d0b7cf236501','imp_e224f29300614e5f8f7b','hist_3adc18318298f019e8dd','2023-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_b001af04c47b7c746574','imp_d9699809fd94ae0f8340','hist_3adc18318298f019e8dd','2023-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_276d2a3d40beb5d7dc4e','imp_8dc3f0c566415ccdbb06','hist_3adc18318298f019e8dd','2023-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_44d41bac4f06acdb360b','imp_825cc7d2f6adb791eaf1','hist_378a4f3db64a75f18266','2023-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_a446280f356aeb1bb4cc','imp_8c1ea8f6dc6f48f13ccc','hist_378a4f3db64a75f18266','2023-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_067edf63e8e828b56adc','imp_b9a2c9eaca0c3fc97331','hist_378a4f3db64a75f18266','2023-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_6a2b744b17387b0730cb','imp_aa291611779ae9b6937f','hist_e89b6108afe6160d7dc7','2022-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_8a81298cf9c295dfba73','imp_bf0e686ef7790d0ea4db','hist_e89b6108afe6160d7dc7','2022-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_be7ed60a26ac565fefbf','imp_24d1569de3382672f984','hist_e89b6108afe6160d7dc7','2022-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_7bc2d157b317f1144ccd','imp_f47db10ad7c8048a50cb','hist_e5377e8f76aa0ea0b95f','2022-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_fe073ccdc5de359b2d80','imp_d9699809fd94ae0f8340','hist_e5377e8f76aa0ea0b95f','2022-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
INSERT INTO "StudentEnrollment"(id,"studentId","classSectionId","enrollDate",status,notes) VALUES
 ('hist_7e1ec5e79b030a0b2ee7','imp_b9a2c9eaca0c3fc97331','hist_e5377e8f76aa0ea0b95f','2022-07-01','GRADUATED','histbackfill-20260721; campus-inferred') ON CONFLICT ("studentId","classSectionId") DO NOTHING;
