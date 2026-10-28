---
name: supabase-db-rls-auditor
description: Audit Supabase database schema, migrations, row level security policies, Edge Functions, auth boundaries, and local/remote migration state. Use when working on Supabase database testing, RLS, policies, migrations, Edge Functions, or backend data security.
---

# Supabase DB and RLS Auditor

Focus on the database as the final authority. The frontend may lie. The agent may hallucinate. The database should not politely hand private data to strangers.

## Discovery

Inspect:
- `supabase/config.toml`
- `supabase/migrations/*.sql`
- `supabase/seed.sql`
- `supabase/functions/**`
- generated types
- app Supabase client initialization
- env var naming
- any SQL helper functions
- storage buckets/policies if present

Suggested commands when available:

```bash
supabase status
supabase migration list
supabase db lint
supabase test db
supabase functions serve --env-file .env
```

Do not push migrations without explicit user intent.

## RLS policy audit checklist

For every exposed table:
- RLS enabled
- no accidental public read/write
- policies exist for every intended operation
- SELECT policy matches intended read model
- INSERT uses `WITH CHECK`
- UPDATE uses both `USING` and `WITH CHECK`
- DELETE is intentionally restricted
- tenant/salon/project scoping is present
- owner/user fields cannot be spoofed by client input
- policies use `auth.uid()` or trusted helper functions
- helper functions are safe, stable enough, and not abusable
- indexes exist on columns used in RLS predicates
- service role is only used in trusted server code

## Cross-tenant/cross-user testing pattern

Create or identify fake test actors:
- `user_a`
- `user_b`
- `staff_a`
- `staff_b`
- `admin_a`
- `admin_b`
- two tenants/salons/projects

Test matrix:
- user A reads own row: should pass
- user A reads user B row: should fail
- user A updates user B row: should fail
- staff A reads own tenant: should pass
- staff A reads other tenant: should fail
- admin A reads own tenant: should pass
- admin A reads other tenant unless superadmin: should fail
- anonymous reads private table: should fail

## Edge Function audit

For each function:
- read the request parsing
- identify auth checks
- identify where Supabase client is created
- detect service-role usage
- verify user identity is derived from JWT, not request body
- verify tenant/salon/project is derived from trusted membership, not user input
- validate all input with a schema
- check idempotency for booking/payment/notification operations
- check safe errors
- check logging does not include secrets or private data

## Migration sanity

Before modifying migrations:
1. Check existing migration order.
2. Check remote/local mismatch risk.
3. Prefer creating a new migration over editing applied migrations.
4. For dangerous changes, write rollback SQL notes.
5. Avoid dashboard-only schema changes. Pull or diff them into migration files.

## Output

Always produce:
- table inventory summary
- RLS risk summary
- Edge Function risk summary
- exact files/policies to fix
- tests to add
- safe next command
