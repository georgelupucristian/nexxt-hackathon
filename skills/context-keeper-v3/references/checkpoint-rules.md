# Checkpoint and compaction rules

## Admission test

Before saving an item, ask:

1. Would forgetting this likely cause meaningful rework, contradiction, risk, or more than a quick lookup?
2. Is it not already obvious from the repository, `CLAUDE.md`, or another memory entry?
3. Is it still relevant, or does it preserve rationale/evidence that constrains future work?

Save only when the answer supports retention.

## Checkpoint order

1. Update outcome/objective only if they changed.
2. Replace current state, next actions, blockers, active constraints, working set, and verification boundary.
3. Add or amend durable topic entries.
4. Update pointers under `Load on demand`.
5. Write one short last-checkpoint line.
6. Remove duplication and stale active-state wording in the same edit.

## Adaptive compression

Do not compress by blindly deleting words. Compress in this order:

1. Remove duplicate facts and conversational narration.
2. Replace code explanations with exact path/symbol references.
3. Move inactive detail from `NOW.md` into the relevant topic file.
4. Merge entries that share the same decision, blocker, or verification boundary.
5. Move completed milestone history to `archive/`.
6. Keep unique rationale, rejected alternatives that may recur, security/legal constraints, and verification evidence.

## Staleness

- Current repository evidence overrides memory.
- If a claim is no longer confirmed, downgrade `[V]` to `[A]` or `[?]`; do not silently preserve certainty.
- When branch or commit differs from the checkpoint base, validate only the areas relevant to the current task unless the user requests a full audit.
- Superseded decisions stay only when the reason helps prevent reversal or explains existing architecture.

## Retrieval hygiene

- Give topic headings stable, specific names.
- Keep one subject per heading.
- Use exact identifiers that Grep can locate.
- Do not create one enormous “miscellaneous” topic.
- Split a file when selective retrieval regularly pulls unrelated material.
