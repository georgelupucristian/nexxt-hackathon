---
name: hackathon-ready
description: Write code that the team can actually defend to hackathon judges - inline comments in a real developer's voice that explain WHY (not what), plus four living docs (decision log, plain-English walkthrough, demo script, build log) that get updated as the project is built rather than panic-written at the end. Use this skill whenever the user mentions a hackathon, a demo day, a judged project, a pitch or presentation of something they're coding, being graded on explaining their code, or says things like "we need to be able to explain this", "the judges will ask", "document as we go", "make the comments sound human", or "this looks like AI slop". Also use it proactively at the start of any time-boxed build where the work will later be presented to someone.
---

# Hackathon Ready

Hackathon judges grade two different things: does the thing work, and do the people who built it understand it. The second one is where teams that used AI heavily lose points — not because the code is bad, but because nobody on the team can say why the queue is Redis instead of Postgres, or what happens when the websocket drops.

This skill fixes that at the source. Every non-obvious decision gets written down at the moment it's made, in two places: a short comment in the code where the decision lives, and a line in a doc the team can read before they walk on stage.

## Read this part twice

Writing in a human voice and writing a build narrative both create pressure to produce a *good story*. Under that pressure the natural failure is to invent one — a debugging war story that never happened, a timestamp for work you didn't witness, a `FIXME:` marker you claim is in the code but never wrote. This was measured, not guessed: an earlier version of this skill produced **more** fabrication than no skill at all, and the invented details clustered exactly in the places where the format asked for a story.

So the governing rule is: **a visible blank always beats a plausible sentence.**

When you don't know something, write `<the team fills this in>` and move on. A doc with four honest gaps in it is a working document. A doc with four confident inventions in it is a trap that springs during Q&A, in front of judges, on the one team member who believed it.

Three specific traps, because these are where it actually happened:

**Claims about the repo must be greppable.** Before writing "it's marked `FIXME:` in the code" or "we have tests for that" or "there's a comment explaining it" — go look. If the marker isn't there, either add it or don't claim it. A judge with the repo open falsifies that kind of line in five seconds, and it's usually attached to the answer that could least afford to lose credibility.

**"What was the hardest bug?" cannot be answered from source code.** Judges ask it specifically to find out whether the team wrote the code, so a fabricated answer here is the single worst thing in the whole document. If the build log doesn't record a real one, leave the question with a blank and tell the user, in your summary, that this is the one answer they have to supply themselves.

**Timelines can't be reconstructed.** In catch-up mode you weren't there. Don't backfill `BUILDLOG.md` with invented hours. If the project is a git repo, `git log --format='%ad %s' --date=format:'%H:%M'` is real evidence and is a legitimate seed. Otherwise leave the file with its header and let the team fill it forward from now.

**Scripted speech counts too.** The "what we say" column of a run of show is the easiest place to slip — "this is a 40-minute product meeting we recorded yesterday" reads as harmless color, but the team will say it verbatim under stress and it may be false. Write `<what this recording actually is>` and let them fill it. Same for any answer: if you tell the team never to claim they have tests, don't hand them an answer three pages earlier that says "we tested it by running it". Reread the cheat sheet against the never-say list before you finish.

And the general form of all of these: never state a reason that didn't happen. If the auth is JWT because that's the library that was already installed and it was 2am, say that — not "chose JWT for stateless horizontal scalability". Real constraints are defensible and judges know it. A benchmark nobody ran is not.

The line that's actually hard to hold: **you may explain mechanism, you may not report experience.** "SSE because updates only flow one direction and the browser reconnects on its own" is mechanism — anyone can verify it from the code. "which is why ingest feels slow when the API is having a bad day" reports something someone would have had to watch happen. Same for "it saved us building an index", "we never checked whether these come back normalized", "too big to fix tonight". They read as candid, which is exactly why they slip through. Cut the clause or drop the tense: `no index here - exact scan over a few thousand rows` says the useful part without claiming anybody lived it.

One mechanical consequence: **placeholders belong in docs, never in source files.** A `<whoever tuned this, write it down>` bracket committed into `main.py` is worse than no comment. In code, an honest marker in the normal voice does the job — `TODO: nobody remembers where 0.78 came from, ask before judging`.

## Two modes

**Live mode (default, and much better).** The comments and doc entries get written as the code is written. When you make an architectural choice mid-task, you already hold the reasoning — that's the only moment it's cheap to record, and the only moment it's guaranteed true. Append to `docs/DECISIONS.md` and `docs/BUILDLOG.md` as part of the same edit.

**Catch-up mode.** The user points at code that already exists. Read it fully before writing a single comment, and work out what it actually does — not what it looks like it does. Where intent genuinely isn't recoverable, either hedge visibly in the comment or ask; a wrong comment is worse than no comment. Batch your questions, two or three, not twenty.

Work out which mode applies and say so in one line. Don't ask.

## Commenting

Full style guide with worked examples: `references/comment-style.md`. Read it before the first commenting pass — the examples carry more than the rules do.

The short version:

- Lowercase start, no trailing period. Contractions. One line where one line does.
- Comment the **why**, the **gotcha**, and the **thing that will bite you** — never the what. If the comment can be derived by reading the line below it, delete it.
- Density varies. A gnarly reconciliation function gets five comments; a CRUD handler gets none. Uniform commenting is the loudest tell that a machine did it, and it also buries the comments that matter.
- Write in first person plural where it's natural (`we cap this at 50 because the free tier rate-limits`).
- Leave honest `TODO:` and `HACK:` markers where they're true. A judge who finds `HACK: breaks if two users submit in the same ms, ran out of time` reads it as self-awareness.
- **Every hardcoded, mocked, seeded or demo-only value gets a comment saying so.** No exceptions. This is the class of thing that ends demos, and it's the one the commenting pass most often walks straight past.

## The four docs

All four live in `docs/`. Run `scripts/init_docs.py <project-root>` to scaffold them from `assets/templates/` — it won't overwrite anything that already exists.

| File | What it's for | When it gets touched |
|---|---|---|
| `docs/DECISIONS.md` | Why X and not Y, one entry per real fork in the road | The moment a choice is made |
| `docs/WALKTHROUGH.md` | How the system works end to end, for a non-technical judge | After each major piece lands |
| `docs/DEMO.md` | Run-of-show, demo-killer checklist, hard-question cheat sheet | Rough early, tightened in the last two hours |
| `docs/BUILDLOG.md` | Timestamped log of what got built and what broke | Continuously, one line at a time |

Per-doc writing guidance, with weak-vs-strong examples: `references/doc-guides.md`. Read it before writing into any of these for the first time.

Three things worth holding onto now:

**DECISIONS.md only gets an entry when there was a real alternative.** "Used Python" is not a decision. "Used SSE instead of websockets because updates only flow one direction and SSE reconnects on its own" is. If an entry can't name the road not taken, cut it. Six to twelve entries is what a 24-hour build actually contains.

**WALKTHROUGH.md traces one piece of data all the way through, concretely, naming real files.** If a paragraph would survive being pasted into a different team's project, it's too abstract to be worth reading.

**DEMO.md is the highest-value file in the repo** and has its own process below.

## Before writing a run of show: check the demo can actually happen

This is not optional and it is not a formality. In testing, the version of this skill without this step wrote a beautiful eight-beat demo script for a project whose happy path *could not execute* — nothing in the repo advanced a job past its initial state, so the app would have hung silently on stage. The skill noted the problem as a question for the team and then scripted around it anyway.

So before writing a single beat, trace the demo path through the actual code and confirm each step can happen:

- Follow the state the demo depends on. Who sets it? Is that function called by anything?
- Is every service the path touches actually wired up, or is one of them a stub nobody finished?
- Is the data the demo needs seeded, and by what?

**If the happy path can't run, that is the headline of the document, not a footnote.** Say so at the top, say what the smallest fix is, and only then write the run of show — for the fixed version, clearly labeled as depending on that fix.

Then check the boring killers, which end more demos than architecture ever does:

- **CORS** — a separate frontend origin with no middleware on the API is a blank screen and a two-line fix
- **Ports and env vars** on the actual demo machine, not the dev machine
- **Seeded state** — the pre-loaded job, user, or record the demo opens on
- **Network** — what is hitting the venue wifi live, and what happens when it doesn't
- **The unchecked failure** — a fetch or upload whose result is never inspected will fail silently and look like a hang

## The judge-question test

Once the project roughly works, put on the judge's hat and attack it. This is the step teams skip and it's the one that wins points.

1. **Write ten hard questions, and ground each one in a specific `file:line`.** That constraint is what separates this from a generic list. "Isn't this just a wrapper around an LLM API?" gets asked of every project and teaches you nothing; "your sources return the chunk's first-word timestamp at `main.py:119`, and chunks are 400 words — so clicking a citation can land almost three minutes early, right?" is the question that actually lands. Cap the positioning questions (competitors, business model, what's novel) at two; the rest come from the code.

2. **Answer each in two or three speakable sentences.** Read them aloud in your head. If a sentence needs a second pass to parse, rewrite it. A nervous person reads these at T-minus-90-seconds.

3. **Where there's no good answer, say so, and pair it with what you'd do about it.** "We don't handle that — with another day we'd put the writes behind a queue" beats a bluff every time. Judges consistently reward the team that knows its own weak spots.

4. **Every question whose answer isn't already recorded in the code or another doc is a gap.** Go fill it.

Attack surfaces worth walking through, since they come up nearly every time: what breaks at 1000 users, authorization (can I read someone else's data), what's hardcoded or faked, input validation and anything client-supplied that's trusted, prompt injection if there's a model in the loop, secrets handling, data retention and deletion, idempotency of anything that re-runs, and the missing artifacts a judge might ask to see (schema, migrations, tests, README).

## Final-hour checklist

When the user is near the deadline or asks for a pre-submission pass, run through this and **report what's missing rather than silently fixing everything** — they need to know what's weak, not just have it patched.

- The demo happy path has been traced through the code and can actually execute
- Every file someone will open during judging has comments where the tricky parts are, and none where they aren't
- `DECISIONS.md` covers every choice a judge will poke at, each naming its alternative and its cost
- `WALKTHROUGH.md` traces at least one complete path end to end
- `DEMO.md` has the run-of-show, the demo-killer checklist, and ten grounded questions answered
- `BUILDLOG.md` reflects real events only
- Every claim about the repo in every doc has been verified against the repo
- Everything hardcoded, mocked, or faked is labeled in the code **and** listed in `DEMO.md`

Then tell the user, plainly, the two or three weakest points in their story and what would shore them up. Being useful here means being blunt. Also tell them, explicitly, which blanks only they can fill.
