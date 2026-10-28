---
name: context-keeping
description: Maintain and recover working context across long or multi-step tasks by creating concise state snapshots, decision logs, and next-step handoffs. Use when work spans many files/commands, when requirements evolve, when a task is paused/resumed, or when users ask to preserve, summarize, or restore task context.
---

# Context Keeping

## Overview
Maintain a compact, high-signal memory of the task so progress survives long sessions and handoffs.
Capture only information needed to continue execution safely and quickly.

## Workflow

### 1) Build a Context Snapshot
Record:
- objective: what success looks like right now
- current state: what is already done
- constraints: permissions, environment limits, formatting rules, deadlines
- scope: touched files, commands run, systems affected

Keep each item to 1-3 lines.

### 2) Maintain a Decision Log
For each meaningful choice, store:
- decision
- reason
- alternatives rejected (brief)
- impact on next steps

Prefer concrete facts over narrative.

### 3) Track Open Threads
Maintain:
- open questions blocking progress
- assumptions currently in use
- risks or uncertainties to verify

Mark each item as `open`, `resolved`, or `deferred`.

### 4) Write a Resume Block
Before pausing or handoff, create a short continuation block with:
- exact next command(s) or file edit(s)
- expected outcome
- fallback if the next action fails

## Quality Rules
- prioritize recency: update stale context first
- prefer bullet points over prose
- avoid duplicating code or large logs
- include absolute file paths when referring to files
- separate facts from assumptions explicitly

## Reference Template
Use [context-ledger-template.md](references/context-ledger-template.md) as the default structure for snapshots, decision logs, and handoffs.
