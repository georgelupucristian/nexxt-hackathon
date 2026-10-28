# Memory layout

Create only the files needed by the project. A useful initial structure is:

```text
.claude/context/
├── NOW.md
├── topics/
│   ├── decisions.md
│   ├── architecture.md
│   ├── product-and-design.md
│   ├── integrations-and-deployment.md
│   └── verification-and-issues.md
└── archive/
```

Do not create empty topic files merely to satisfy the example.

## NOW.md template

```markdown
# Project Working Set

<!-- context-keeper:v3 -->
<!-- updated: YYYY-MM-DD HH:MM TZ -->
<!-- base: branch=<name-or-unknown> commit=<hash-or-unknown> -->
<!-- never store secrets -->

## Outcome
- [R/V/A/?] Measurable final result.

## Current objective
- The one objective this session should advance.

## Current state
- [V] Completed and proven state.
- [R/A] Active implementation state.
- [B] Blocked state, owner/source of truth, and impact.

## Next actions
1. Exact action, first path/system, and expected proof.
2. Dependency-ordered follow-up.

## Do not redo or change
- Verified work, approved choices, or dangerous dead ends.

## Active constraints
- Only constraints that can change the next implementation decision.

## Working set
- `path :: symbol/area` — why it matters now.

## Verification boundary
- Last proven result.
- What is still unverified and how to prove it.

## Open questions
- [?] Question — source of truth or person who can answer it.

## Load on demand
- `topics/decisions.md#<heading>` — when this is needed.
- `topics/<file>.md#<heading>` — when this is needed.

## Last checkpoint
- `YYYY-MM-DD HH:MM TZ` — changed | decided | verified | blocked | resume with.
```

`NOW.md` is a working set, not a full history. It should survive a fresh chat without requiring the model to reread the repository, but it should not contain background irrelevant to the next few tasks.

## Topic file pattern

Use descriptive headings that can be found exactly. Each entry should be independently understandable.

```markdown
# Decisions

## D-012 — Server-side form validation
- Status: active
- Evidence: [V/R/A/?]
- Decided: YYYY-MM-DD
- Choice: ...
- Reason: ...
- Consequence: ...
- Revisit when: ...
- Related: `path :: symbol`, issue, route, or integration
```

For architecture, product, design, content, integrations, deployment, verification, and issues, use the same principle: concise facts, provenance/status, exact references, and a clear reason the entry matters.

## Archive

Move unique but inactive history to `archive/YYYY-MM.md` or a named milestone file. Archive only when removal from active topic files improves retrieval. The archive is never part of normal startup context.
