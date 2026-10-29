#!/usr/bin/env bash
# Runs the database tests (supabase/tests/*.sql) and exits 1 if any case fails.
# Each file is one transaction that ends in ROLLBACK, so nothing is kept, even on a real project.
#
#   supabase/tests/run.sh                                  the local stack (supabase start / supabase db start)
#   DATABASE_URL='postgresql://...' supabase/tests/run.sh  any other Postgres with the migrations applied
set -euo pipefail

db="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
here="$(cd "$(dirname "$0")" && pwd)"
failed=0

for file in "$here"/*.sql; do
  echo "== $(basename "$file")"
  # -At prints bare "PASS | area | test | detail" lines; ON_ERROR_STOP turns a broken file into an exit code
  out="$(psql "$db" -X -q -v ON_ERROR_STOP=1 -At -F ' | ' -f "$file")"
  results="$(printf '%s\n' "$out" | grep -E '^(PASS|FAIL) \| ' || true)"
  if [ -z "$results" ]; then echo "no results from $(basename "$file")"; failed=1; continue; fi
  printf '%s\n' "$results"
  if printf '%s\n' "$results" | grep -qE '^FAIL \| '; then failed=1; fi
done

exit "$failed"
