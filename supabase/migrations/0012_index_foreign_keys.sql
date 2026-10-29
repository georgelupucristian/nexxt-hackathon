-- Supabase performance advisor, lint 0001 (unindexed foreign keys). Both columns are read on hot
-- paths: parent_links.student_user_id by the RLS policy and the webhook's parent-match lookup,
-- ledger_entries.goal_id by check_milestones and withdraw_own, and by "on delete set null" when a
-- goal is deleted (demo reset). Plain btree indexes; both tables are small, so the brief lock while
-- they build is harmless.
create index if not exists ledger_entries_goal_idx on public.ledger_entries (goal_id);
create index if not exists parent_links_student_idx on public.parent_links (student_user_id);
