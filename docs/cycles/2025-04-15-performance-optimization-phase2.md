# Performance Optimization - Phase 2: Full Audit & Bundle Optimization
**Cycle Date:** 2025-04-15
**Status:** 📋 IN PROGRESS (Spec + Plan Complete)
**Type:** Performance Optimization

---

## 🎯 Initial Request

**User Request:** "do full audit to optimize performance, ensuring page and data load is fast"

**Context:**
- Phase 1 Quick Wins completed (50-60% improvement achieved)
- Deployed to staging: N+1 query fixes, query parallelization, static data caching
- Ready for comprehensive optimization: bundle, rendering, queries, assets, caching

---

## 📋 Spec

### Objective
Build on Phase 1 success to deliver comprehensive performance optimization across:
1. Bundle size reduction (dynamic imports, code splitting)
2. Rendering efficiency (server component optimization)
3. Query performance (remaining N+1 fixes, pagination)
4. Asset optimization (images, fonts)
5. Caching strategy expansion (HTTP, CDN)
6. Performance monitoring (Vercel Analytics, dashboard)

**Target:** 60-70% additional improvement, achieving sub-1.5s desktop, sub-1s mobile page loads.

### Success Criteria
- [ ] Admin Dashboard: <1.5s (currently ~2s post-Phase 1)
- [ ] Parent Dashboard: <1s (currently ~1.5s post-Phase 1)
- [ ] Teacher Dashboard: <800ms (currently ~1s post-Phase 1)
- [ ] All list pages: <1.2s load time
- [ ] Core Web Vitals: LCP <2.5s, FID <100ms, CLS <0.1
- [ ] Bundle: First Load JS <200KB, page-specific JS <100KB
- [ ] Database: Query time p95 <100ms, API response p95 <300ms
- [ ] Testing: 80%+ coverage, all tests passing

### Tech Stack
- Next.js 15 (App Router), TypeScript 5.x, React 19
- Supabase PostgreSQL, Prisma 7.x
- Shadcn UI (62 components), Tailwind CSS
- Vercel (hosting, analytics, CDN)
- Vitest (unit tests), Playwright (E2E tests)

---

## 🏗️ Plan

### Task Breakdown (19 Tasks, 7 Phases)

**Phase 1: Bundle Analysis & Baseline (Day 1)**
- Task 1: Run Bundle Analyzer and Establish Baseline
- Task 2: Identify Dynamic Import Candidates

**Phase 2: Dynamic Import Optimization (Day 1-2)**
- Task 3: Dynamic Import for Heavy Admin Components
- Task 4: Dynamic Import for Parent Portal Components

**Phase 3: Server Component Optimization (Day 2-3)**
- Task 5: Audit Client Components for Server Conversion
- Task 6: Convert Low-Risk Client Components to Server Components
- Task 7: Optimize Component Boundaries (Server/Client Split)

**Phase 4: Query Optimization (Day 3-4)**
- Task 8: Audit List Pages for N+1 Queries
- Task 9: Fix N+1 Queries in Admin List Pages
- Task 10: Add Pagination to All List Endpoints

**Phase 5: Image & Asset Optimization (Day 4-5)**
- Task 11: Audit All Images in Codebase
- Task 12: Convert Critical Images to Next.js Image Component
- Task 13: Optimize Font Loading Strategy

**Phase 6: Caching Strategy Expansion (Day 5-6)**
- Task 14: Audit API Routes for Caching Opportunities
- Task 15: Add HTTP Caching to Static Data Endpoints
- Task 16: Implement CDN Caching for Static Assets

**Phase 7: Performance Monitoring (Day 6-7)**
- Task 17: Set Up Vercel Analytics
- Task 18: Add Performance Monitoring Dashboard
- Task 19: Document Performance Optimization Results

### Architecture Decisions
1. **Bundle Analyzer:** Next.js built-in with @next/bundle-analyzer
2. **Dynamic Imports:** For heavy client components (>50KB) with loading skeletons
3. **Server Components:** Audit and convert where possible
4. **Image Optimization:** Next.js Image with lazy loading, migrate to Vercel Blob
5. **Caching:** HTTP caching (revalidate) + Vercel KV for sessions (if needed)

---

## 🔨 Implementation

### Phase 1: Bundle Analysis & Baseline

**Status:** 🔄 IN PROGRESS

**Task 1: Run Bundle Analyzer and Establish Baseline**
- [x] Production build completed successfully
- [x] @next/bundle-analyzer installed and configured
- [x] Build script updated with `npm run build:analyze`
- [x] Note: Next.js 16 uses Turbopack by default, which is incompatible with @next/bundle-analyzer
- [x] Manual bundle analysis completed using .next/static output
- [x] Baseline metrics documented

**Bundle Analysis Results (Baseline):**

**Total Bundle Size:**
- Total static assets: 2.8MB
- Total chunks: 2.6MB
- Number of JS chunks: 69

**Top 10 Largest Chunks:**
1. `0ttnl3fcetfjp.js` - 224KB
2. `13ojrm6i1~.xo.js` - 136KB
3. `13~t64h-3pqf-.js` - 128KB
4. `0faxuclj6ttmf.js` - 120KB
5. `03~yq9q893hmn.js` - 112KB
6. `10vh6ct3uxw2x.js` - 76KB
7. Multiple 56KB chunks (5 files)
8. Multiple 44KB chunks (3 files)

**Largest Page Files (by line count):**
1. `app/admin/students/[id]/page.tsx` - 612 lines
2. `app/admin/admissions/page.tsx` - 605 lines
3. `app/admin/invoices/page.tsx` - 550 lines
4. `app/admin/settings/roles/page.tsx` - 530 lines
5. `app/admin/academic/page.tsx` - 506 lines
6. `app/admin/settings/users/page.tsx` - 505 lines
7. `app/admin/payroll/[id]/page.tsx` - 453 lines
8. `app/admin/leave/page.tsx` - 411 lines
9. `app/admin/employees/[id]/page.tsx` - 356 lines
10. `app/admin/employees/page.tsx` - 309 lines

**Parent Portal Largest Files:**
1. `app/parent/invoices/client.tsx` - 270 lines
2. `app/parent/invoices/invoice-detail-sheet.tsx` - 258 lines
3. `app/parent/page.tsx` - 164 lines

**Key Findings:**
- Total routes: 124 (admin + teacher + parent + API)
- Large page files (>500 lines) indicate poor code splitting
- Multiple pages with 600+ lines suggest opportunities for component extraction
- Parent portal has manageable file sizes (<300 lines)

**Task 2: Identify Dynamic Import Candidates**
- [ ] Components >50KB identified
- [ ] Priority list created

**Checkpoint:**
- [x] Bundle baseline established
- [ ] Optimization targets identified

---

### Phase 2: Dynamic Import Optimization

**Status:** ⏳ PENDING

**Task 3: Dynamic Import for Heavy Admin Components**
- [ ] Top 5 admin components use dynamic imports
- [ ] Loading skeletons implemented
- [ ] Bundle size reduced by 15-20%

**Task 4: Dynamic Import for Parent Portal Components**
- [ ] InvoiceDetailSheet uses dynamic import
- [ ] Parent portal First Load JS reduced by 20%

**Checkpoint:**
- [ ] Bundle size reduced by 15-20%
- [ ] All tests passing
- [ ] No visual regressions

---

### Phase 3: Server Component Optimization

**Status:** ⏳ PENDING

**Task 5: Audit Client Components for Server Conversion**
- [ ] All client components audited
- [ ] Conversion candidates identified

**Task 6: Convert Low-Risk Client Components to Server Components**
- [ ] Top 5 components converted
- [ ] Client JS reduced by 10-15%

**Task 7: Optimize Component Boundaries**
- [ ] 3-5 components refactored
- [ ] Server/client split optimized

**Checkpoint:**
- [ ] Client JS reduced by 10-15%
- [ ] All tests passing

---

### Phase 4: Query Optimization

**Status:** ⏳ PENDING

**Task 8: Audit List Pages for N+1 Queries**
- [ ] All list pages audited
- [ ] N+1 queries identified

**Task 9: Fix N+1 Queries in Admin List Pages**
- [ ] Top 4 admin pages optimized
- [ ] Query count reduced by 60-70%

**Task 10: Add Pagination to All List Endpoints**
- [ ] All list endpoints support pagination
- [ ] API response time <300ms

**Checkpoint:**
- [ ] Query count reduced by 60-70%
- [ ] API response time <300ms
- [ ] All tests passing

---

### Phase 5: Image & Asset Optimization

**Status:** ⏳ PENDING

**Task 11: Audit All Images in Codebase**
- [ ] All images identified
- [ ] Optimization opportunities documented

**Task 12: Convert Critical Images to Next.js Image Component**
- [ ] Top 10 images optimized
- [ ] Lazy loading enabled

**Task 13: Optimize Font Loading Strategy**
- [ ] All fonts use next/font
- [ ] FOUT eliminated

**Checkpoint:**
- [ ] Images optimized
- [ ] Fonts optimized
- [ ] Lighthouse scores improved
- [ ] All tests passing

---

### Phase 6: Caching Strategy Expansion

**Status:** ⏳ PENDING

**Task 14: Audit API Routes for Caching Opportunities**
- [ ] All API routes audited
- [ ] Caching strategy defined

**Task 15: Add HTTP Caching to Static Data Endpoints**
- [ ] Static data endpoints have revalidate export
- [ ] API response time <100ms for cached data

**Task 16: Implement CDN Caching for Static Assets**
- [ ] CDN caching enabled
- [ ] Cache headers configured

**Checkpoint:**
- [ ] API response time <100ms for cached data
- [ ] All tests passing

---

### Phase 7: Performance Monitoring

**Status:** ⏳ PENDING

**Task 17: Set Up Vercel Analytics**
- [ ] Analytics installed
- [ ] Core Web Vitals tracked

**Task 18: Add Performance Monitoring Dashboard**
- [ ] Dashboard at /admin/performance
- [ ] Metrics displayed

**Task 19: Document Performance Optimization Results**
- [ ] Before/after metrics documented
- [ ] Cycle doc complete

**Checkpoint:**
- [ ] All monitoring in place
- [ ] Documentation complete

---

## 🧪 Testing

### Test Strategy
- **Unit Tests:** Vitest for utilities, helpers, API logic
- **Integration Tests:** Vitest for API routes with mocked DB
- **E2E Tests:** Playwright for critical user flows
- **Performance Tests:** Lighthouse for Core Web Vitals

### Coverage Requirements
- Target: 80% code coverage (currently 71.11%)
- Critical paths: 90%+ coverage
- UI components: 70%+ coverage

### Test Results
- **Baseline:** 137/137 tests passing (100%)
- **Coverage:** 71.11% (target: 80%)
- **Build:** Successful with no errors

---

## 👨‍💻 Code Review

**Status:** ⏳ PENDING (After implementation complete)

**Review Axes:**
1. Correctness - All optimizations working as expected
2. Readability - Clean code, clear naming
3. Architecture - Following existing patterns
4. Security - No vulnerabilities introduced
5. Performance - Measurable improvements

---

## 🚀 Shipping

**Status:** ⏳ PENDING (After review approved)

**Deployment Target:** Staging Only (NOT Production)

**Pre-Launch Checklist:**
- [ ] Code Quality: All tests passing, build successful
- [ ] Security: No vulnerabilities, auth maintained
- [ ] Performance: Metrics meet targets
- [ ] Accessibility: No regressions
- [ ] Infrastructure: No migrations needed
- [ ] Documentation: Complete

**Rollback Plan:**
```bash
git revert <commit-range> --no-edit
git push origin staging
```

**Time to Rollback:** <15 minutes

---

## 📊 Results & Metrics

### Baseline (Post-Phase 1)
- Admin Dashboard: ~2s load time
- Parent Dashboard: ~1.5s load time
- Teacher Dashboard: ~1s load time
- Database Queries: ~200ms p95
- API Response: ~500ms p95
- Test Coverage: 71.11%

### Targets (Post-Phase 2)
- Admin Dashboard: <1.5s load time (25% improvement)
- Parent Dashboard: <1s load time (33% improvement)
- Teacher Dashboard: <800ms load time (20% improvement)
- Database Queries: <100ms p95 (50% improvement)
- API Response: <300ms p95 (40% improvement)
- Test Coverage: 80%+ (8.8% improvement)

### Progress Tracking
- Phase 1: ⏳ PENDING (0/2 tasks)
- Phase 2: ⏳ PENDING (0/2 tasks)
- Phase 3: ⏳ PENDING (0/3 tasks)
- Phase 4: ⏳ PENDING (0/3 tasks)
- Phase 5: ⏳ PENDING (0/3 tasks)
- Phase 6: ⏳ PENDING (0/3 tasks)
- Phase 7: ⏳ PENDING (0/3 tasks)

**Overall Progress:** 0/19 tasks (0%)

---

## 📝 Notes

### Key Principles
- **Vertical Slicing:** Optimize one complete path at a time (DB → API → Server → Client)
- **Measure First:** Use bundle analyzer, Lighthouse, query logging before optimizing
- **Test Everything:** All optimizations must have tests, no regressions
- **Document Results:** Before/after metrics for every optimization

### Risks & Mitigations
- **Dynamic imports cause layout shift:** Use loading skeletons
- **Server component conversion breaks functionality:** Thorough testing
- **Bundle size increases:** Rollback and investigate
- **Query optimization changes semantics:** Data validation
- **Caching causes stale data:** Appropriate TTL, monitoring

### Open Questions
1. Image migration: Vercel Blob now or Phase 3?
2. Session caching: Vercel KV now or Phase 3?
3. Performance budget: Enforce in CI?
4. Mobile testing: 3G or 4G targets?
5. E2E performance tests: Now or Phase 3?

---

**Cycle Started:** 2025-04-15
**Estimated Duration:** 7 days
**Current Phase:** Spec + Planning Complete
**Next Step:** Begin Phase 1 (Bundle Analysis & Baseline)
**Status:** 📋 READY TO START
