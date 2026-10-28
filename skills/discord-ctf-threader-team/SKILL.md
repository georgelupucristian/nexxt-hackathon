---
name: discord-ctf-threader-team
description: Shareable team version of the Discord CTF threader that uses the embedded team bot token and guild ID.
---

# discord-ctf-threader-team

Use this skill when your team wants to operate the shared Discord threader against the configured server without doing per-user token setup.

This skill runs the repo-local Python wrapper:

- `python3 scripts/team_discord_ctf.py ...`

## Workflow

1. Run `ensure-channels` if category channels may be missing.
2. Run `ensure-thread` for the category/challenge pair first.
3. Run `read-thread` before making claims about prior work.
4. Post short factual updates when there is meaningful progress.
5. Run `mark-done` when the challenge is solved.

## Rules

- The wrapper already injects the shared bot token, guild ID, and channel map.
- Messages posted by Codex must still be prefixed by `[CODEX_AGENT_NAME]`.
- Do not create duplicate challenge threads.
- Keep updates concise and reproducible.

## Command Templates

```bash
python3 scripts/team_discord_ctf.py ensure-channels
python3 scripts/team_discord_ctf.py ensure-thread --category pwn --challenge babyrop
python3 scripts/team_discord_ctf.py read-thread --category pwn --challenge babyrop --limit 20
python3 scripts/team_discord_ctf.py post-update --category pwn --challenge babyrop --message-file /tmp/update.txt
python3 scripts/team_discord_ctf.py mark-done --category pwn --challenge babyrop
```
