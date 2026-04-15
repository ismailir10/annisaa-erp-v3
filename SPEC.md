# UI Audit & Security Hardening Spec

**Project:** An Nisaa' School ERP — Teacher & Parent Portal Audit
**Date:** 2026-04-15
**Priority:** CRITICAL — Security & UI consistency blocking
**Scope:** Teacher Portal + Parent Portal (mobile-first portals)
**Approach:** Balanced security + UI consistency, immediate fixes

---

## 1. Objective

### Primary Goals

1. **Security Hardening** — Fix authentication, authorization, and tenant isolation vulnerabilities in Teacher & Parent portals
2. **UI Consistency** — Ensure all UI patterns follow project standards (Shadcn components, CSS variables, DataTable standards)
3. **Code Quality** — Improve error handling, TypeScript type safety, and accessibility
4. **Component Standardization** — Replace custom implementations with Shadcn components where applicable

### Success Criteria

- [ ] All API routes have proper role validation (TEACHER/GUARDIAN checks)
- [ ] All UI components use Shadcn before custom implementations
- [ ] No hardcoded colors — all using CSS variables
- [ ] All list pages use DataTable with standard action columns
- [ ] All forms use Field component (not raw Label + Input)
- [ ] All API calls have proper error handling with toast messages
- [ ] All interactive elements have proper ARIA labels and keyboard navigation
- [ ] Zero TypeScript any types in portal components
- [ ] Consistent layout patterns between Teacher and Parent portals

---

## 2. Commands

### Audit Commands

```bash
# Find all non-Shadcn component usage
grep -r "from \"react\"" app/teacher/ app/parent/ --exclude-dir=node_modules

# Find hardcoded colors
grep -r "text-\[" app/teacher/ app/parent/ --exclude-dir=node_modules
grep -r "bg-\[" app/teacher/ app/parent/ --exclude-dir=node_modules

# Find missing role checks in API routes
find app/api -name "route.ts" -exec grep -L "session.role" {} \;

# Find any types
grep -r ": any" app/teacher/ app/parent/ components/teacher/ components/parent/

# Find raw Label + Input (should use Field)
grep -r "<Label>" app/teacher/ app/parent/ components/teacher/ components/parent/ | grep -v "FieldLabel"
```

### Fix Commands

```bash
# Run tests before committing
npm run build && npx vitest run

# Type check
npx tsc --noEmit

# Lint
npm run lint

# E2E tests (if available)
npx playwright test
```

---

## 3. Project Structure

### Directories in Scope

```
app/
├── teacher/              # Teacher Portal (6 pages)
│   ├── dashboard/
│   ├── attendance/
│   ├── slips/
│   ├── students/
│   ├── schedule/
│   └── profile/
├── parent/               # Parent Portal (4 pages)
│   ├── dashboard/
│   ├── invoices/
│   ├── attendance/
│   └── reports/
└── api/
    ├── attendance/       # Teacher/Parent attendance APIs
    ├── slips/           # Teacher slip APIs
    ├── students/        # Parent student data APIs
    └── assessments/     # Parent assessment APIs

components/
├── teacher/              # Teacher-specific components
│   └── bottom-nav.tsx
├── parent/               # Parent-specific components
│   └── bottom-nav.tsx
└── attendance/           # Shared attendance components
    └── calendar.tsx      # ⚠️ Uses custom calendar (needs Shadcn)
```

### Key Files to Modify

**Security (High Priority):**
- `app/api/attendance/my/route.ts` — Add TEACHER role check
- `app/api/slips/my/route.ts` — Add TEACHER role check
- `app/api/assessments/student/[id]/route.ts` — Review role checks

**UI Consistency (High Priority):**
- `components/attendance/calendar.tsx` — Replace hardcoded colors, consider Shadcn Calendar
- `components/teacher/bottom-nav.tsx` — Add ARIA labels
- `components/parent/bottom-nav.tsx` — Ensure consistency with teacher
- `app/teacher/layout.tsx` — Standardize padding with parent
- `app/parent/layout.tsx` — Standardize padding with teacher

**Component Standardization (Medium Priority):**
- All Teacher portal pages — Add DataTableRowActions to lists
- All Parent portal pages — Add DataTableRowActions to lists
- Any form components — Replace Label+Input with Field component

---

## 4. Code Style

### Component Standards

#### 1. Shadcn First Rule

**DO:** Use Shadcn components
```tsx
import { Calendar } from "@/components/ui/calendar"
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field"
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table"
```

**DON'T:** Build custom when Shadcn has it
```tsx
// ❌ Custom calendar
<div className="custom-calendar-grid">
```

#### 2. CSS Variables Rule

**DO:** Use CSS variables from `globals.css`
```tsx
className="text-status-present bg-status-present-subtle"
className="text-destructive"
className="text-warning bg-warning-subtle"
```

**DON'T:** Hardcode hex colors
```tsx
// ❌ From calendar.tsx
className="text-[#00B37E]"  // Should be text-status-present
className="bg-[#E6F9F1]"    // Should be bg-status-present-subtle
```

#### 3. Form Field Standard

**DO:** Use Field component
```tsx
<Field>
  <FieldLabel>Nama Lengkap</FieldLabel>
  <Input value={value} onChange={onChange} />
  <FieldDescription>Optional help text</FieldDescription>
  {error && <FieldError>{error}</FieldError>}
</Field>
```

**DON'T:** Use raw Label + Input
```tsx
// ❌
<Label>Nama Lengkap</Label>
<Input value={value} onChange={onChange} />
```

#### 4. Error Handling Standard

**DO:** Proper error handling with toast
```tsx
const res = await fetch("/api/endpoint");
if (!res.ok) {
  const err = await res.json().catch(() => ({}));
  toast.error(err.error || "Terjadi kesalahan");
  return;
}
const data = await res.json();
```

**DON'T:** Silent error handling
```tsx
// ❌ Missing error message
if (!res.ok) {
  setLoading(false);
  return;
}
```

#### 5. TypeScript Standards

**DO:** Use proper types
```tsx
interface AttendanceRecord {
  id: string;
  date: Date;
  status: "PRESENT" | "LATE" | "ABSENT" | "LEAVE";
}

const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
```

**DON'T:** Use any types
```tsx
// ❌ From calendar.tsx
const where: any = { ... }
```

### API Route Standards

#### Security Checklist (Every Route MUST Have)

```tsx
// 1. Authentication check
const session = await getSession();
if (!session) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

// 2. Role check (CRITICAL - Missing in many routes)
if (session.role !== "TEACHER") {  // or "GUARDIAN"
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// 3. Tenant isolation (CRITICAL - Prevent data leakage)
const data = await prisma.attendance.findMany({
  where: {
    tenantId: session.tenantId,  // ALWAYS filter by tenant
    // ... other filters
  }
});

// 4. Input validation (Zod)
const body = await req.json();
const validated = teacherSchema.parse(body);

// 5. Rate limiting (write operations)
const rateLimit = await checkRateLimit(session.userId);
if (!rateLimit.ok) {
  return NextResponse.json({ error: "Too many requests" }, { status: 429 });
}
```

---

## 5. Testing Strategy

### Unit Tests (Vitest)

**Test Coverage Goals:**
- [ ] All API routes have authentication tests
- [ ] All API routes have role validation tests
- [ ] All API routes have tenant isolation tests
- [ ] Critical components have basic tests

**Example Test:**
```tsx
// api/attendance/my.test.ts
describe("GET /api/attendance/my", () => {
  it("should return 401 without session", async () => {
    const res = await fetch("/api/attendance/my");
    expect(res.status).toBe(401);
  });

  it("should return 403 for non-teacher role", async () => {
    const session = { role: "GUARDIAN", tenantId: "tenant-1" };
    const res = await fetch("/api/attendance/my", { session });
    expect(res.status).toBe(403);
  });

  it("should only return tenant data", async () => {
    const session = { role: "TEACHER", tenantId: "tenant-1" };
    const res = await fetch("/api/attendance/my", { session });
    const data = await res.json();
    expect(data.every(d => d.tenantId === "tenant-1")).toBe(true);
  });
});
```

### Manual Testing Checklist

**Teacher Portal:**
- [ ] All pages load without errors
- [ ] Bottom nav works smoothly with animations
- [ ] Calendar colors are correct (present/late/absent/leave)
- [ ] Attendance submission works
- [ ] Slip viewing works
- [ ] Student list loads correctly

**Parent Portal:**
- [ ] All pages load without errors
- [ ] Bottom nav works smoothly with animations
- [ ] Invoice list shows correct data
- [ ] Invoice detail view works
- [ ] Attendance view shows child's data
- [ ] Reports show correct assessment data

**Security Testing:**
- [ ] Teacher cannot access parent APIs
- [ ] Parent cannot access teacher APIs
- [ ] No cross-tenant data leakage
- [ ] Invalid tokens are rejected
- [ ] Rate limiting works on write operations

**Accessibility Testing:**
- [ ] All navigation links have aria-labels
- [ ] Keyboard navigation works
- [ ] Focus management is correct
- [ ] Screen reader announces changes

---

## 6. Boundaries

### Always Do (Non-Negotiable)

1. **Use Shadcn components** — Never build custom when Shadcn has it
2. **Check role permissions** — Every API route must validate `session.role`
3. **Filter by tenant** — Every query must include `where: { tenantId: session.tenantId }`
4. **Handle errors gracefully** — All fetch calls must check `res.ok` and show toast errors
5. **Use CSS variables** — Never hardcode colors, use variables from `globals.css`
6. **Type everything** — No `any` types in production code
7. **Test before commit** — Run `npm run build && npx vitest run` before every commit

### Ask First (Ambiguous Cases)

1. **Component changes** — If unsure whether to use Shadcn vs custom, ask
2. **Breaking changes** — Any changes that might break existing functionality
3. **API behavior changes** — If changing request/response format
4. **New dependencies** — Before adding new packages
5. **Major refactorings** — If restructuring large parts of the codebase

### Never Do (Forbidden)

1. **Hard delete records** — Always use soft delete via status change
2. **Bypass role checks** — Never "just this once" skip authentication
3. **Cross-tenant queries** — Never return data from another tenant
4. **Silent errors** — Never `.catch(() => {})` without logging
5. **Hardcoded colors** — Never use `text-[#00B37E]` or similar
6. **Custom components** — Never build when Shadcn has equivalent
7. **Skip tests** — Never commit without running build + tests
8. **Direct main commits** — Never push directly to main branch

---

## 7. Implementation Phases

### Phase 1: Security Hardening (Critical - Day 1)

**Priority:** IMMEDIATE - Security vulnerabilities

1. Add role checks to all Teacher/Parent API routes
2. Verify tenant isolation on all queries
3. Add rate limiting to write operations
4. Add proper error messages that don't leak system info

**Files:**
- `app/api/attendance/my/route.ts`
- `app/api/slips/my/route.ts`
- `app/api/students/my/route.ts`
- `app/api/assessments/student/[id]/route.ts`

**Acceptance Criteria:**
- [ ] All API routes return 401 without session
- [ ] All API routes return 403 for wrong role
- [ ] All queries filter by tenantId
- [ ] Manual testing confirms no cross-tenant data leakage

### Phase 2: UI Consistency - Critical Issues (Day 1-2)

**Priority:** HIGH - Blocks user experience

1. Replace hardcoded colors in calendar component
2. Standardize bottom navigation between portals
3. Add proper ARIA labels to all navigation
4. Fix layout padding inconsistencies

**Files:**
- `components/attendance/calendar.tsx`
- `components/teacher/bottom-nav.tsx`
- `components/parent/bottom-nav.tsx`
- `app/teacher/layout.tsx`
- `app/parent/layout.tsx`

**Acceptance Criteria:**
- [ ] No hardcoded colors in calendar (all CSS variables)
- [ ] Both portals use identical bottom nav pattern
- [ ] All nav links have aria-labels
- [ ] Layouts have consistent padding

### Phase 3: Component Standardization (Day 2-3)

**Priority:** MEDIUM - Improves maintainability

1. Add DataTableRowActions to all list pages
2. Replace Label+Input with Field component in forms
3. Standardize action buttons (Lihat, Edit, Delete)
4. Add proper loading states with Skeleton

**Files:**
- All Teacher portal pages with lists
- All Parent portal pages with lists
- Any components with forms

**Acceptance Criteria:**
- [ ] All lists use DataTable with standard actions
- [ ] All forms use Field component
- [ ] All buttons follow naming conventions
- [ ] All pages have skeleton loading states

### Phase 4: Code Quality & TypeScript (Day 3-4)

**Priority:** MEDIUM - Improves type safety

1. Remove all `any` types from portal components
2. Add proper TypeScript interfaces for all data
3. Improve error handling in all components
4. Add useCallback/useMemo where appropriate

**Files:**
- `components/attendance/calendar.tsx` (has any types)
- Any component with any types
- Components with performance issues

**Acceptance Criteria:**
- [ ] Zero `any` types in portal code
- [ ] All data properly typed
- [ ] All API calls have proper error handling
- [ ] No unnecessary re-renders

### Phase 5: Testing & Documentation (Day 4-5)

**Priority:** MEDIUM - Ensures quality

1. Write unit tests for critical API routes
2. Write component tests for shared components
3. Update CLAUDE.md with audit findings
4. Create security audit report

**Deliverables:**
- [ ] Unit test suite with 80%+ coverage
- [ ] Security audit report
- [ ] UI consistency checklist
- [ ] Updated CLAUDE.md with fixes

---

## 8. Success Metrics

### Security Metrics

- 0 API routes missing role checks
- 0 API routes with cross-tenant data leakage
- 0 API routes missing input validation
- 100% of write operations have rate limiting

### UI Consistency Metrics

- 0 hardcoded colors (all using CSS variables)
- 100% of lists use DataTable with standard actions
- 100% of forms use Field component
- 100% of navigation elements have ARIA labels

### Code Quality Metrics

- 0 `any` types in portal code
- 100% of API calls have proper error handling
- TypeScript strict mode passes without errors
- ESLint passes without warnings

### Testing Metrics

- 80%+ code coverage on API routes
- 70%+ code coverage on components
- All manual testing checklists pass
- Zero accessibility issues in critical flows

---

## 9. Rollback Plan

If critical issues are found after deployment:

1. **Revert to previous commit** immediately
2. **Fix issue** locally with proper testing
3. **Create fix PR** with detailed explanation
4. **Deploy to preview** for testing
5. **Deploy to production** only after approval

**Emergency Rollback Command:**
```bash
git revert HEAD
git push origin staging
```

---

## 10. Related Documentation

- **CLAUDE.md** — Project UI standards and security guidelines
- **prd.md** — Product requirements and roadmap
- **README.md** — Project setup and overview

---

**Next Steps:**

1. Review this spec and confirm acceptance criteria
2. Start with Phase 1: Security Hardening (critical)
3. Work through phases sequentially
4. Update spec as issues are discovered
5. Document all findings and fixes

**Questions or concerns? Raise them before starting implementation.**
