#!/usr/bin/env bash

set -euo pipefail

ROOT="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ROOT"

permission_key='(exports|observability|admins|users|introducer_changes|countries|settings|pages|credits|credit_transactions|logs|audit_logs)\.[a-z_]+'
permission_matches="$(
  {
    rg -n \
      --glob '*.ts' \
      --glob '*.tsx' \
      --glob '!frontend/admin/src/permissions.ts' \
      "permission\\s*:\\s*\"${permission_key}\"" \
      frontend/admin/src || true
    rg -n \
      --glob '*.ts' \
      --glob '*.tsx' \
      --glob '!frontend/admin/src/permissions.ts' \
      ":\\s*Permission(?:\\[\\])?\\s*=\\s*.*\"${permission_key}\"" \
      frontend/admin/src || true
    rg -n \
      --glob '*.ts' \
      --glob '*.tsx' \
      --glob '!frontend/admin/src/permissions.ts' \
      "(usePermission|hasPermission|hasAllPermissions)\\([^\\n]*\"${permission_key}\"" \
      frontend/admin/src || true
  } | sed '/^$/d'
)"

if [ -n "$permission_matches" ]; then
  echo "starter guardrail failed: inline admin permission literals must live in frontend/admin/src/permissions.ts" >&2
  echo "$permission_matches" >&2
  exit 1
fi

helper_matches="$(
  rg -n \
    --glob '*.rs' \
    --glob '!tests/support/**' \
    '^\s*(pub\s+)?(async\s+)?fn\s+(run_cli|reset_database|boot_api|send_json|get_html|issue_admin_token)\b' \
    tests || true
)"

if [ -n "$helper_matches" ]; then
  echo "starter guardrail failed: shared integration-test helpers must live in tests/support/" >&2
  echo "$helper_matches" >&2
  exit 1
fi

header_matches="$(
  rg -n \
    --glob '*.ts' \
    --glob '*.tsx' \
    --glob '!frontend/admin/src/components/AdminPageHeader.tsx' \
    'sf-page-header' \
    frontend/admin/src || true
)"

if [ -n "$header_matches" ]; then
  echo "starter guardrail failed: sf-page-header markup must live in shared admin page header components" >&2
  echo "$header_matches" >&2
  exit 1
fi
