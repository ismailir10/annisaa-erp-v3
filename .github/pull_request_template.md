<!--
This template is auto-populated by `/ship` from the current cycle doc.
If you are filling it manually, replace the placeholders in each section.
-->

## Summary

<!-- One paragraph from the cycle doc's ## Context -->

## Cycle Doc

<!-- Link to docs/cycles/YYYY-MM-DD-<slug>.md -->

## Session

- **Model:** <!-- e.g. claude-sonnet-4-6, claude-haiku-4-5, glm-5.2, gpt-5 -->
- **Role:** <!-- cto | product-builder -->

## Gates

- [ ] `npm run build` passed
- [ ] `npx vitest run` passed
- [ ] Cycle doc `## Implementation`, `## Verification`, `## Ship Notes` all filled
- [ ] No scratch `.md` files created (allowlist enforced by pre-commit)
- [ ] Every commit has `Model-Trailer` and `Role` in its message

## CTO Review Checklist

- [ ] Scope matches the cycle spec — no orthogonal changes
- [ ] Tenant isolation preserved on every touched API route (`tenantId` filter)
- [ ] Shadcn-first UI rules followed (no custom where Shadcn exists)
- [ ] Soft-delete pattern preserved (no hard deletes)
- [ ] No sensitive data in logs or error messages
- [ ] Ship Notes include any manual steps needed on production

## Rollback

<!-- From the cycle doc's ## Ship Notes — how to roll this back if it breaks -->
