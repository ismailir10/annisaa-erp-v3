#!/usr/bin/env bash
# verify-pii-annotations.sh
#
# Static check: every known-PII Prisma field MUST carry the expected
# `/// @PII <policy>` triple-slash annotation in prisma/schema.prisma.
#
# Why hardcoded list (not heuristic field-name scan): a heuristic would
# false-positive on Campus.email (operational tenant email, not PDP-protected)
# and miss compound PII like Student.kkNumber (KK = Indonesian family card).
# The hardcoded list is updated each cycle that lands a PII field. Mirrors
# verify-rls-coverage.sh's hardcoded floor pattern.
#
# Annotation grammar (consumed by scripts/generate-audit-redactor.ts):
#   nik    String?  @db.VarChar(16)  /// @PII redact
#   phone  String?  @db.VarChar(20)  /// @PII mask:last4
#
# Policies recognised:
#   - redact:      top-level field replaced with null in the audit log.
#   - mask:last4:  string values → '***' + last 4 chars in the audit log.
#
# Cycle history:
#   p1-employees                     — Employee.nik (redact)         [migration 03]
#   p1-audit-timeline-files          — Employee.phone (mask:last4)   [migration 06]
#   p2-students-guardians-household  — Student.nik  (redact)         [migration 07]
#   p2-guardians                     — Guardian.nik (redact),
#                                      Guardian.phone (mask:last4)   [migration 08]
#   p2-admission-funnel-schema       — Admission.applicantNik (redact),
#                                      Admission.fatherNik (redact),
#                                      Admission.motherNik (redact),
#                                      Admission.fatherPhone (mask:last4),
#                                      Admission.motherPhone (mask:last4) [migration 11]
#
# Future cycles extend the TRIPLES array below as new PII fields land.
#
# Spec:  docs/superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md §5.13
# Cycle: docs/cycles/2026-05-05-p1-audit-timeline-files.md (first introduced),
#        docs/cycles/2026-05-06-p2-guardians.md            (count grew to 5/5)

set -euo pipefail

SCHEMA="prisma/schema.prisma"

if [ ! -f "$SCHEMA" ]; then
  echo "✗ $SCHEMA not found; run from repo root." >&2
  exit 2
fi

# Triples format: "Model:field:policy"
# Updated each cycle that lands a PII field.
TRIPLES=(
  "Employee:nik:redact"
  "Employee:phone:mask:last4"
  "Guardian:nik:redact"
  "Guardian:phone:mask:last4"
  "Student:nik:redact"
  "Admission:applicantNik:redact"
  "Admission:fatherNik:redact"
  "Admission:motherNik:redact"
  "Admission:fatherPhone:mask:last4"
  "Admission:motherPhone:mask:last4"
)

missing=()
mismatched=()
ok=0

# extract a model block (lines between `model X {` and the matching `}`)
extract_model_block() {
  local model="$1"
  awk -v m="$model" '
    $0 ~ "^model " m " *\\{"  { in_block=1; print; next }
    in_block && /^}/          { print; exit }
    in_block                  { print }
  ' "$SCHEMA"
}

for entry in "${TRIPLES[@]}"; do
  # Triple is "Model:field:policy" but policy may itself contain ':' (mask:last4).
  model="${entry%%:*}"
  rest="${entry#*:}"
  field="${rest%%:*}"
  policy="${rest#*:}"

  block="$(extract_model_block "$model")"
  if [ -z "$block" ]; then
    missing+=("$model.$field (model not found)")
    continue
  fi

  # Match a line beginning with the field name (whitespace + ident),
  # ending with the expected /// @PII <policy> annotation. Anchor on
  # `///` to avoid matching the policy name elsewhere on the line.
  pattern="^[[:space:]]+${field}[[:space:]].*///[[:space:]]*@PII[[:space:]]+${policy}([[:space:]]|$)"

  if echo "$block" | grep -Eq "$pattern"; then
    ok=$((ok+1))
  else
    # Distinguish missing-entirely vs wrong-policy.
    if echo "$block" | grep -Eq "^[[:space:]]+${field}[[:space:]]"; then
      mismatched+=("$model.$field (expected policy '$policy')")
    else
      missing+=("$model.$field (field not found)")
    fi
  fi
done

total=${#TRIPLES[@]}
exit_code=0

if [ ${#missing[@]} -gt 0 ]; then
  echo "✗ Missing PII annotations in $SCHEMA:"
  printf '    - %s\n' "${missing[@]}"
  exit_code=1
fi

if [ ${#mismatched[@]} -gt 0 ]; then
  echo "✗ PII annotation policy mismatch in $SCHEMA:"
  printf '    - %s\n' "${mismatched[@]}"
  exit_code=1
fi

if [ $exit_code -eq 0 ]; then
  echo "✓ PII annotation coverage OK: $ok / $total known-PII fields annotated."
else
  echo ""
  echo "Fix: add the expected '/// @PII <policy>' annotation to the field"
  echo "     line in $SCHEMA, then run:"
  echo "         npm run audit:redactor"
  echo "     to regenerate lib/audit/redactor.ts deterministically."
fi

exit $exit_code
