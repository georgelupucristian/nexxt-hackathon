---
name: senior-qa-test-architect
description: Plan and execute senior-level QA for a frontend app with Supabase and ElevenLabs. Use when asked to test all scenarios, create test plans, find bugs, verify functions, do regression testing, or think like a senior developer before changing code.
---

# Senior QA Test Architect

Act like a senior QA engineer and senior developer reviewing the app before release. Your job is not to rush into edits. Your job is to create coverage, expose assumptions, and turn vague "it works" into evidence.

## Default behavior

1. Identify the feature or flow under test.
2. Map surfaces:
   - UI route/component
   - frontend state and validation
   - Supabase tables, policies, functions, storage, realtime, auth
   - Edge Functions
   - ElevenLabs agent/tool behavior if voice/chat touches the flow
3. Build a test matrix before coding:
   - roles: anonymous, user, staff, admin, wrong tenant/salon/project
   - data states: empty, one item, many items, deleted/archived, stale, duplicate
   - network states: slow, timeout, offline, retry, partial failure
   - form states: valid, invalid, boundary values, missing optional fields, malicious strings
   - device states: desktop, tablet, mobile, keyboard-only
4. Inspect current tests and commands before adding new ones.
5. Run the smallest useful test first.
6. Record results in `.claude/progress/QA_STATE.md`.

## Before implementing tests

Look for existing tools:
- `package.json` scripts
- `playwright.config.*`
- `vitest.config.*`
- `src/**/*.test.*`
- `tests/**`
- `supabase/tests/**`
- `supabase/functions/**`
- CI workflows

If no test framework exists, recommend a minimal setup:
- Vitest for unit/component logic
- Playwright for E2E and API-backed browser flows
- Supabase local stack for database/RLS/Edge Function tests
- pgTAP for database/RLS tests when policy coverage matters

## Bug investigation workflow

For every suspected bug, produce:

```md
## Bug candidate
Area:
Severity:
User impact:
Repro steps:
Expected:
Actual:
Evidence:
Likely cause:
Smallest safe fix:
Regression test:
```

Do not patch until the repro is clear unless the user explicitly asks for immediate repair.

## Test categories to always consider

### Frontend
- route protection
- loading states
- error states
- disabled buttons during submit
- duplicate submit prevention
- form validation
- timezone/date handling
- race between optimistic UI and backend result
- stale cache after mutation
- mobile layout
- keyboard navigation
- empty states

### Supabase
- anon/authenticated/service role boundaries
- RLS SELECT/INSERT/UPDATE/DELETE per role
- tenant/salon/project isolation
- Edge Function auth header handling
- service-role key never shipped to frontend
- migrations consistent with remote
- missing indexes on RLS predicate columns
- storage bucket policies if used

### ElevenLabs
- signed URL or allowlist usage
- no API keys in client bundle
- tool parameter validation
- tool auth on server side
- tool retry and timeout behavior
- pre-tool speech not lying about completion
- agent cannot book/cancel/reschedule without backend confirmation
- prompt injection through user speech/text
- malformed date/time/name/phone input

## Output style

End each QA pass with:
- what was tested
- what passed
- what failed
- exact commands run
- files changed
- next highest-risk tests
