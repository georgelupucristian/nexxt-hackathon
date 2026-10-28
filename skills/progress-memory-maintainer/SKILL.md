---
name: progress-memory-maintainer
description: Maintain project QA memory and handoff notes across Claude Code sessions. Use when the user asks to save progress, remember testing state, create a handoff, continue QA later, or keep track of bugs and completed checks.
---

# Progress Memory Maintainer

Use this skill to keep durable, useful QA state without turning the repo into a junk drawer with Markdown in it.

## Files

Primary file:
- `.claude/progress/QA_STATE.md`

Optional files:
- `.claude/progress/BUGS.md`
- `.claude/progress/SECURITY_FINDINGS.md`
- `.claude/progress/TEST_MATRIX.md`
- `.claude/progress/HANDOFF.md`

## What to save

Save:
- tested flows
- exact commands that passed/failed
- important bugs and repros
- security findings and status
- migrations touched
- Edge Functions touched
- ElevenLabs tools tested
- test users/roles as labels only
- next highest-risk checks
- rollback notes

Do not save:
- API keys
- JWTs
- service-role keys
- signed URLs
- real phone numbers/emails
- real customer transcripts
- passwords
- sensitive production data

## Session-end update

At the end of a major work block, update `.claude/progress/QA_STATE.md` with:

```md
## Last handoff

- What changed:
- What was tested:
- What passed:
- What failed:
- Files touched:
- Commands run:
- Migrations touched:
- Security risks found:
- Next best action:
- Rollback notes:
```

## Bug table format

```md
| ID | Severity | Area | Bug | Repro | Evidence | Fix status | Test status |
|---|---|---|---|---|---|---|---|
```

## Security table format

```md
| ID | Severity | Asset | Finding | Actor | Impact | Evidence | Fix | Regression test |
|---|---|---|---|---|---|---|---|---|
```

## Working rule

Update progress only after real inspection, tests, or changes. Do not invent progress to make the user feel better. Humans do enough theatre already.
