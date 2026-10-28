# How to write the four docs

Templates live in `../assets/templates/`. This file is about what makes an entry good rather than what shape it is.

Contents:
- [Shared principles](#shared-principles)
- [DECISIONS.md](#decisionsmd)
- [WALKTHROUGH.md](#walkthroughmd)
- [DEMO.md](#demomd)
- [BUILDLOG.md](#buildlogmd)

---

## Shared principles

**Written for a reader who wasn't there.** A judge has 8 minutes with the project and no context. Every doc assumes zero prior knowledge of what the team built.

**Specific beats complete.** Three entries naming real files and real numbers are worth more than fifteen abstract ones. If a sentence would be true of any project, cut it.

**Prose over bullet soup.** These are meant to be read out loud during prep. Short paragraphs read better than nested bullets. Use bullets for genuine lists — options considered, steps in a demo — not as a default layout.

**Present tense for how it works, past tense for what happened.** WALKTHROUGH is present, BUILDLOG is past, DECISIONS is a mix.

**Never write a sentence the team can't defend.** Same rule as the comments. If nobody benchmarked it, don't say benchmarked.

**A visible blank beats a plausible sentence.** Docs create pressure to sound complete, and that pressure is where invented detail gets in. `<the team fills this in>` is a finished line — it tells the reader exactly what to do. A confident guess in the same slot is a landmine with the team's name on it.

**Verify every claim you make about the repo.** If a doc says "it's marked `FIXME:` in the code" or "we have tests covering that", grep before writing it. This exact failure — three docs asserting `FIXME:` markers that were never written — was the worst thing found when this skill was tested, because it was attached to the security answer, the one that could least afford to be falsified.

---

## DECISIONS.md

The point of this file is that when a judge asks "why did you use X", any team member can answer in the same way, with the real reason.

**An entry is warranted when there was a genuine fork** — two or more workable options and a reason one won. Not every technology in the stack is a decision. Python because that's what everyone knows is barely a decision; it gets one line in the stack section at the top, not an entry.

**Every entry names the alternative and why it lost.** An entry without a road-not-taken is not a decision, it's a description. This is the single most common failure in these files.

**Include the constraint.** Hackathon decisions are made under time, API access, laptop specs, and what the sponsor track requires. Those constraints are the actual reason most of the time and they're completely legitimate. `we had 6 hours left and the team knew Flask` is a real answer.

**Include the cost.** Every choice bought something and paid something. Naming the cost is what makes a judge trust the rest of the doc, and it pre-empts the question they were about to ask.

Weak:

> ### Database
> We chose PostgreSQL for our database because it is a reliable and scalable relational database with excellent support for complex queries and strong ACID guarantees.

Strong:

> ### Postgres + pgvector instead of a dedicated vector DB
> We needed vector search for the transcript matching, so the obvious options were Pinecone, Chroma, or just putting pgvector on the Postgres we already had running.
>
> We went with pgvector because we were already storing the transcript metadata relationally and splitting it across two stores would have meant keeping IDs in sync by hand — with 14 hours left that felt like where the bugs would come from. Pinecone would've been faster to set up in isolation but it's a second service to configure and a second set of keys to leak.
>
> Cost: pgvector's index build is slow and we're doing exact search over ~4k vectors, which is fine at this size but would fall over somewhere in the low hundreds of thousands. At that point we'd move to a real vector store.

Aim for 6–12 entries. Order them roughly by how likely a judge is to ask.

---

## WALKTHROUGH.md

This is the "explain it to me like I'm not on your team" doc. The test of a good one: a judge reads it in three minutes and can then correctly predict what happens when they click a button in the demo.

**Open with one paragraph on what the thing does for a human being.** Not the architecture — the point. Who uses it and what they get.

**Then trace one piece of data all the way through.** Pick the main path. A user does this concrete thing, this request goes to this file, this happens to it, it comes back looking like this. Name real files and real function names as you go, because that's what turns the doc into a map of the repo.

**Name the components after you've traced the path, not before.** A list of services means nothing to someone who hasn't seen them do anything yet.

**Explain any unusual word the first time it appears.** Embeddings, idempotency, WebRTC, vector search, RAG — one clause each. Judges span a wide range of technical depth and the ones who know the term don't mind seeing it defined.

**Add a short "what happens when it goes wrong" section.** What breaks, what the user sees, what's unhandled. Teams that can describe their failure modes read as engineers.

Weak:

> The frontend communicates with the backend via a REST API. The backend processes the request and returns the data to the frontend, which then renders it for the user.

Strong:

> Say you drop a 40-minute meeting recording onto the page. The browser doesn't upload it to us directly — `web/src/upload.ts` asks our API for a signed URL and sends the file straight to object storage, which keeps a 200MB file from tying up our one server process for two minutes.
>
> The API then puts a job on the queue with the file's location. `worker/transcribe.py` picks it up, runs Whisper over it, and splits the transcript into chunks of roughly 400 words that overlap by 50 — the overlap matters because a question about something said right on a chunk boundary would otherwise lose half its context.

---

## DEMO.md

Two parts, both written for a stressed human reading them 90 seconds before going on.

**The run-of-show.** Numbered beats with rough timings, and for each one, the sentence being said while the click happens. Mark clearly which parts of the demo depend on network, which are pre-seeded, and which have a fallback. Include the backup plan for the demo gods — a recording, a local fixture, a screenshot — because the wifi will fail.

**The cheat sheet.** Ten questions, honest answers, generated adversarially per the process in SKILL.md. Question in bold with a `file:line` citation, two-to-three-sentence answer underneath in speakable language — this gets read aloud, so no sentence should need a second pass.

**The `file:line` citation is the quality gate.** A question you can't attach to a line is a question about hackathon projects in general, not about this one, and it's dead weight on the page. When this was tested, the run that cited lines produced 17 genuinely sharp questions; the run that cited only filenames produced 8 and padded the rest with "isn't this just a wrapper around an LLM?" — a question every team is asked and no team learns anything from. Cap the positioning questions (competitors, business model, what's novel) at two.

Weak, unciteable:

> **Q: How would this scale?**
> A: Right now it's a single instance, but the architecture is designed so we could add more workers and put a load balancer in front.

Strong, grounded, and admits the cost:

> **Q: You return the chunk's first-word timestamp as the citation — doesn't that land me in the wrong place?** `worker/ingest.py:47`
> A: Yeah, it can be off. Chunks are 400 words, so a citation can point up to about two and a half minutes before the sentence that actually answers you. We'd fix it by keeping per-word offsets and pointing at the matched sentence, but that didn't fit in the time.

A useful sweep, though let the code drive it rather than the list: what breaks at 1000 users, authorization (can I read someone else's data), what's hardcoded or faked, client-supplied values the server trusts, prompt injection where there's a model in the loop, secrets, retention and deletion, idempotency of anything re-runnable, and the artifacts a judge may ask to see — schema, migrations, tests, README.

**"What was the hardest bug?"** deserves its own note. Judges ask it specifically to find out whether the team wrote the code, and a real answer — the symptom, the wrong hypothesis, the fix — settles that in one breath. It's also unanswerable from source code, which makes it the highest-risk line in the document. Take it from `BUILDLOG.md` or from the team. If neither has one, leave it blank and say so out loud in your summary; this is the answer they must supply themselves.

---

## BUILDLOG.md

The cheapest doc to keep and the most convincing evidence that the team did the work. One line per meaningful event, timestamped, appended as it happens. Never rewritten to look tidy afterwards.

**In catch-up mode you weren't there, so you cannot write this file.** Reconstructing a timeline from source code means inventing one, and invented timestamps are trivially caught — in testing, a generated log carried entries stamped twenty minutes after the file's own mtime. If the project is a git repo, `git log --format='%ad %s' --date=format:'%H:%M'` is real evidence and a legitimate seed. Otherwise leave the header in place, tell the user the file is theirs to fill, and start logging forward from the current moment.

The same applies to anything else that only the team witnessed: what they tried first, what they argued about, how long something took.

Log: things that started working, things that broke, decisions made (cross-reference the DECISIONS entry), things abandoned, and the moments where the plan changed.

```
14:20  repo up, docker compose with postgres + redis running
15:05  whisper working locally but 6 min for a 40 min file, too slow for live demo
15:40  switched to their hosted transcription api instead - see DECISIONS "transcription"
17:15  first end to end run, transcript -> chunks -> embeddings -> search. ugly but works
19:30  BROKE: embeddings coming back all zeros. two hours gone. was sending the wrong
       field name and their api returns 200 with a zero vector instead of erroring
21:45  frontend hooked up, dropped the multi-user feature - not happening in the time left
```

The 19:30 entry is the kind that wins points. Don't sanitize the log.
