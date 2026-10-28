---
name: discord-ctf-threader
description: Minimal Discord thread helper for CTF progress tracking. Use whenever working on a CTF challenge that should be synced to a Discord challenge thread.
---

# discord-ctf-threader

Use this skill whenever you are actively working a CTF challenge and Discord progress tracking is required.

This skill runs a local CLI from the `discord-ctf-threader` project directory:

- Set `DISCORD_CTF_THREADER_DIR` to the project directory (for example `/home/kali/discord-ctf-threader`).
- Invoke the CLI with `npm --prefix "$DISCORD_CTF_THREADER_DIR" run discord-ctf -- ...`.

## When To Use

Use `$discord-ctf-threader` whenever:

- you are working on a CTF challenge under categories like `pwn`, `web`, `rev`, `crypto`, `forensics`, or `misc`
- progress must be synced to the challenge thread in Discord

Do not use it for non-CTF tasks.

## Required Workflow

0. If category channels might not exist yet, run `ensure-channels` first.
1. Run `ensure-thread` for the category/challenge pair first.
2. Run `read-thread` before making claims about prior work.
3. Post short updates only when there is meaningful progress.
4. Run `mark-done` when the challenge is solved.

## Critical Rules

- Prefer `--dry-run` first unless explicitly told to post live updates.
- Do not invent prior progress. Read the thread first.
- Do not create duplicate challenge threads.
- Keep updates concise and factual.
- Agent messages must be prefixed by `[CODEX_AGENT_NAME]` (handled by the CLI via env var).

## Command Templates

```bash
npm --prefix "$DISCORD_CTF_THREADER_DIR" run discord-ctf -- ensure-channels --dry-run
npm --prefix "$DISCORD_CTF_THREADER_DIR" run discord-ctf -- ensure-thread --category pwn --challenge babyrop --dry-run
npm --prefix "$DISCORD_CTF_THREADER_DIR" run discord-ctf -- read-thread --category pwn --challenge babyrop --limit 20 --dry-run
npm --prefix "$DISCORD_CTF_THREADER_DIR" run discord-ctf -- post-update --category pwn --challenge babyrop --message-file /tmp/update.txt --dry-run
npm --prefix "$DISCORD_CTF_THREADER_DIR" run discord-ctf -- mark-done --category pwn --challenge babyrop --dry-run
```

## Channel Auto-Creation

- To automatically create missing category channels during `ensure-thread`, set `DISCORD_AUTO_CREATE_CHANNELS=true`.
- Default is off. Prefer explicitly running `ensure-channels` first.
