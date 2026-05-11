-- Pack 1 (Foundation): Admission domain redesign.
-- Adds structured address geo columns to Student (Section 3.5 of spec)
-- and structured home/employer address + portal invite columns to Parent.
-- All columns are nullable; no defaults (app layer handles picker state per reviewer m3).
-- Legacy fields (Student.address, Parent.address, Parent.employerAddress, Parent.employerCity) are untouched.

-- Student: structured residence address (9 cols)
ALTER TABLE "Student" ADD COLUMN "addressLine"         TEXT;
ALTER TABLE "Student" ADD COLUMN "addressVillageCode"  TEXT;
ALTER TABLE "Student" ADD COLUMN "addressVillageName"  TEXT;
ALTER TABLE "Student" ADD COLUMN "addressDistrictCode" TEXT;
ALTER TABLE "Student" ADD COLUMN "addressDistrictName" TEXT;
ALTER TABLE "Student" ADD COLUMN "addressRegencyCode"  TEXT;
ALTER TABLE "Student" ADD COLUMN "addressRegencyName"  TEXT;
ALTER TABLE "Student" ADD COLUMN "addressProvinceCode" TEXT;
ALTER TABLE "Student" ADD COLUMN "addressProvinceName" TEXT;

-- Parent: structured home address (9 cols)
ALTER TABLE "Parent" ADD COLUMN "homeAddressLine"   TEXT;
ALTER TABLE "Parent" ADD COLUMN "homeVillageCode"   TEXT;
ALTER TABLE "Parent" ADD COLUMN "homeVillageName"   TEXT;
ALTER TABLE "Parent" ADD COLUMN "homeDistrictCode"  TEXT;
ALTER TABLE "Parent" ADD COLUMN "homeDistrictName"  TEXT;
ALTER TABLE "Parent" ADD COLUMN "homeRegencyCode"   TEXT;
ALTER TABLE "Parent" ADD COLUMN "homeRegencyName"   TEXT;
ALTER TABLE "Parent" ADD COLUMN "homeProvinceCode"  TEXT;
ALTER TABLE "Parent" ADD COLUMN "homeProvinceName"  TEXT;

-- Parent: structured employer address (9 cols)
ALTER TABLE "Parent" ADD COLUMN "employerAddressLine"   TEXT;
ALTER TABLE "Parent" ADD COLUMN "employerVillageCode"   TEXT;
ALTER TABLE "Parent" ADD COLUMN "employerVillageName"   TEXT;
ALTER TABLE "Parent" ADD COLUMN "employerDistrictCode"  TEXT;
ALTER TABLE "Parent" ADD COLUMN "employerDistrictName"  TEXT;
ALTER TABLE "Parent" ADD COLUMN "employerRegencyCode"   TEXT;
ALTER TABLE "Parent" ADD COLUMN "employerRegencyName"   TEXT;
ALTER TABLE "Parent" ADD COLUMN "employerProvinceCode"  TEXT;
ALTER TABLE "Parent" ADD COLUMN "employerProvinceName"  TEXT;

-- Parent: portal invite tracking (2 cols)
ALTER TABLE "Parent" ADD COLUMN "portalInviteSentAt" TIMESTAMP(3);
ALTER TABLE "Parent" ADD COLUMN "portalInviteSentBy" TEXT;
