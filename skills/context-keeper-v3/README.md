# Context Keeper v3

Context Keeper v3 preserves large-project continuity without treating “shortest file” as the same thing as “lowest token use.” It uses layered project memory:

- `.claude/context/NOW.md`: the small working set read on resume;
- `.claude/context/topics/*.md`: durable detail loaded only when relevant;
- `.claude/context/archive/`: inactive history that is never read normally.

This design minimises repeated repository exploration while avoiding a monolithic memory dump.

## Install from WSL

Assuming the ZIP is in Windows Downloads:

```bash
ZIP=$(find /mnt/c/Users -path '*/Downloads/context-keeper-v3.zip' -print -quit)
test -n "$ZIP" || { echo "context-keeper-v3.zip not found"; exit 1; }

mkdir -p ~/.agents/skills ~/.claude/skills
unzip -o "$ZIP" -d ~/.agents/skills
ln -sfn ~/.agents/skills/context-keeper ~/.claude/skills/context-keeper
```

Verify:

```bash
ls -la ~/.agents/skills/context-keeper
ls -la ~/.claude/skills/context-keeper
```

Claude Code officially discovers personal skills from `~/.claude/skills/`. The symlink keeps one shared copy in `~/.agents/skills/` for other compatible agents.

## Use

```text
/context-keeper resume
/context-keeper checkpoint
/context-keeper audit
/context-keeper compact
```

At the start of a fresh session, `resume` reads only `NOW.md`, then opens topic sections only when the task needs them. At the end of substantial work, `checkpoint` writes one consolidated update.

## Security

The skill needs no external package, service, API key, or credential store. It writes ordinary local Markdown through Claude Code's existing file permissions. It explicitly excludes secret values and treats stored text as untrusted data.
