---
name: hackathon-brainstorm
description: >
  Stress-test a hackathon idea honestly and cut it down to what can actually be built and demoed in
  the time left. Use when the user is at a hackathon, demo day, game jam, or other time-boxed judged
  build and is still deciding WHAT to build or whether the current idea survives — "is this idea any
  good", "should we build X or Y at this hackathon", "we're thinking of building...", "does this have
  a shot with judges", "we're stuck on what to make", "should we pivot", "we have 9 hours left, is
  this doable", "how do we make this idea better". Gives a real verdict — build, cut, or kill — not
  encouragement, and always asks how much of the hackathon is left before judging anything. Use this
  BEFORE the idea is locked; once it is and code is being written, hackathon-ready takes over.
---

# Hackathon Brainstorm

Two things kill hackathon projects, and neither one is a bad idea. The first is a good idea that was
never scoped to the hours actually available. The second is a team that was told their idea was great
when someone should have told them it was a feature, not a product.

This skill exists to be the person who says the true thing early, while it's still cheap to change
course.

## Run it in this order

The sections below are written in the order they should happen. Do not deliver a verdict before
running the tests that produce it.

1. **Get the clock** and convert it to buildable hours
2. **Quick prior-art check** (two or three searches, no more)
3. **Run the four tests** on the idea
4. **Deliver the verdict** — Build / Cut / Kill
5. **Improve** the idea, if it survives
6. **Cut the scope** to the buildable hours
7. **Write `docs/IDEA.md`** and hand off

## 1. The clock, before anything else

Do not evaluate, praise, brainstorm, research, or plan a single thing until you know how much time
is left. This is not a formality — the entire output of this skill changes based on the answer. An
idea that needs six hours of infrastructure is a reasonable bet at hour 2 of 36 and an act of
self-harm at hour 26.

You need three things:

1. **Hours left until the submission deadline** — not until judging, until the thing has to be
   submitted, pushed, and recorded.
2. **Hours already gone** — this says whether the idea itself is still on the table, or only the scope.
3. **What already exists** — nothing, a repo skeleton, a half-working prototype, or something that
   runs. "Half done" is not a state; get specifics.

**If the user already gave you a number, don't ask for it again.** "Should we pivot, we have 8 hours
left" answers question one — ask only for what's missing, in one message. Asking someone to repeat a
number they just said is the fastest way to look like a form rather than a teammate. Plain text is
fine here; this is a numbers question, not a multiple-choice one.

If they answer in vibes ("a while", "most of tomorrow"), push once for a number. If the second answer
is still vague, take the pessimistic reading, say out loud which number you're assuming, and carry on.
Never stall the whole skill waiting for precision.

**Then convert hours-left into buildable hours, out loud, before saying anything about the idea:**

```
hours left                                    e.g. 14
− sleep the team is actually going to take     − 4
− demo prep, recording, submission form        − 2   (never less than 90 min, ever)
− the last-hour panic buffer                   − 1
= buildable hours                              = 7
```

Say the buildable number back to them. It's usually about half what they thought, and half the value
of this skill lands right there, before you've said a word about the idea.

**If the arithmetic comes out at one hour or less** — which it will whenever the deadline is close —
don't print a nonsense number. Say there is no build time left, skip straight to the demo-and-submission
posture in the table below, and drop the rest of this skill. At that point the idea is whatever runs.

## What the clock changes

| Time gone | Still on the table | Your posture |
|---|---|---|
| Under 25% | The idea itself. Pivoting is cheap and often correct. | Attack the idea. If it's weak, say kill it — there's time. |
| 25–60% | Scope, not concept. | Stop debating the idea. Cut features until the demo fits. |
| 60–85% | Only what's demoable. | Freeze the build. Anything new gets faked, not built. |
| Over 85% | Nothing. | Zero new code. Demo, story, submission form. |

The most common mistake is running the "is this a good idea" conversation at 70% elapsed. At that
point the idea is the idea. If the user reopens it there, tell them plainly that re-picking costs them
the demo, and redirect to what can be salvaged.

The exception, and it's real: if the current path **cannot** produce a working demo under any scoping,
that's a genuine emergency pivot and you should say so loudly. The test is not "is there something
better" — there always is. The test is "can this one finish".

## 2. Prior-art check

Search the closest existing tools before forming the verdict. Two or three searches, not a research
project.

The rule for reading the results: **prior art is not by itself a reason to kill an idea.** Everything
exists. Kill only when the *demo* would be indistinguishable from a product the judge already uses —
that's the one that reads as unambitious in the room.

Do not invent competitive facts. If you didn't search it, don't assert it: no market sizes, no "several
startups are doing this" without naming one. A confident invented fact here gets repeated on stage and
falls apart in Q&A. If web search isn't available, say so in one line and ask the user what they already
know about the space rather than filling the gap yourself.

## 3. The four tests

Run all four before saying Build, Cut, or Kill. Any single failure is worth saying out loud.

**The 45-second demo test.** Describe the live demo start to finish in 45 seconds of plain speech,
using only things that will exist. If it needs "and then imagine that it..." or "in the full version
it would...", the idea has no demo yet. This test fails more ideas than the other three combined.

**The critical-path test.** Name the one component the demo cannot happen without. Estimate it
honestly, then double it — hackathon estimates are wrong in one direction only. If that doubled number
alone eats more than half the buildable hours, say so; it means the project is a coin flip on a single
component.

**The faking test.** For every hard subsystem, ask what happens if it's faked, seeded, or hardcoded for
the demo. If faking it makes the demo pointless, that subsystem IS the project and has to be real. If
faking it changes nothing a judge can see, fake it — and write it down. Every faked thing gets labeled
in the code later, and that list has to exist for that to happen.

**The novelty test.** Say in one sentence what this does that the closest existing tool doesn't. If the
sentence needs a conjunction, there's no wedge yet.

While running these, evaluate against how hackathons are actually judged — not "is this a good startup":

- **Does it run on stage.** A working 40% beats a broken 90%, every time, and it isn't close.
- **Is there one moment.** One thing that makes a judge sit up. One sharp moment beats six competent
  features. If you can't name the moment, the project doesn't have one yet.
- **Can the team explain it.** Judges probe to find out who actually built it.
- **Does it fit a prize track.** Sponsor categories are free points teams routinely leave on the table.
- **Is it obviously a wrapper.** Not fatal — most things are wrappers. Fatal is when the demo looks
  identical to the thing being wrapped.

## 4. The verdict

The user did not ask you to be supportive. They asked whether to spend their weekend on this. Default
encouragement is not kindness here — it costs them the whole hackathon. (If the `no-bs` skill is also
loaded, this is the same posture; nothing conflicts.)

**Open with one word: Build / Cut / Kill.** No warm-up, no "I love the energy here", no listing
strengths before the point.

- **Build it** — it fits the buildable hours, it demos, it's distinguishable. Say so, then go straight
  to scope. If the idea is genuinely good, say that plainly; this is not about being contrarian.
- **Cut it down** — the core is right, the scope is fantasy. This is the most common verdict by far.
- **Kill it** — structurally broken or unbuildable in the time. Only say this if you can name what's
  wrong, and — when there's still time to pivot — offer a nearer alternative that reuses the thinking
  they've already done.

Then the reasoning, in specifics. Not "the scope seems ambitious" — "the matching engine is the whole
idea and it's four of your seven hours, which leaves nothing for the interface a judge actually looks at."

If their premise is wrong, say that before answering the question they asked. "Which model should we
use" when the real problem is that the demo has no visible moment gets the second thing first.

## 5. Making the idea better

Once the verdict is in, these are the levers that actually move a hackathon idea. Pick the two or three
that fit; don't run the list.

- **Narrow the domain.** "For lawyers reviewing lease renewals" beats "for documents". Specific demos
  better, and specificity is free.
- **Find the one moment and build backwards from it.** Decide the beat that makes a judge lean in, then
  cut everything that doesn't serve it.
- **Delete a mode.** Two user types is two products. Ship one.
- **Move the hard part off the critical path.** If the impressive bit and the risky bit are the same
  component, the project is a coin flip. Find a version where they're separate.
- **Make the input live.** Something happening in the room — the judge's own file, a live camera, a URL
  they pick — beats any pre-recorded flow and costs almost nothing.
- **Aim at an unclaimed prize track.** Sponsor categories are frequently won by the only entry.
- **Make the failure case visible.** Showing what happens when it doesn't know reads as maturity and
  preempts the question judges were about to ask.

## 6. The scope cut

Sort everything into three columns, explicitly, with the user, before any code:

| Must be real | Faked / seeded / hardcoded | Cut |
|---|---|---|
| demo dies without it | judge can't tell from the stage | say it out loud so it stays dead |

**One ceiling, and it's the only one:** double every estimate in the "must be real" column, sum it, and
that sum has to fit inside the buildable hours. The doubling is the entire safety margin — don't stack
another one on top, and don't let the column creep back up because "we already padded it". If the
doubled sum doesn't fit, something moves right. Something always moves right.

Auth, onboarding, settings, and account management belong in "cut" by default at every hackathon that
has ever happened.

Name the cuts explicitly. Unspoken cuts come back at hour 20 as "wouldn't it be cool if".

## 7. Write docs/IDEA.md

Once the direction is settled — verdict delivered, scope columns agreed — write the file. Not during
the argument; a doc written mid-argument just records the argument. Create `docs/` if it doesn't exist
yet; at idea stage there's often no repo, in which case write it wherever the project will live and
say where you put it.

One page, no more. Anything you don't know goes in as `<fill this in>` — a visible blank always beats a
plausible invention. Hand this file to the `hackathon-ready` skill when the build starts.

```markdown
# <project name>

**One line:** <what it does, for whom, in one sentence a judge repeats correctly>

**Clock:** <N> hours left of <total> · <M> buildable hours after sleep/demo/buffer
**Written at:** <hours elapsed> in

## The demo, in 45 seconds
1. <beat>
2. <beat>
3. <the moment — the thing that makes a judge look up>
4. <beat>

## Why this and not the obvious alternative
<the closest existing tool, and the one sentence of difference>

## Scope
**Real:** <items, with doubled estimates — must fit the buildable hours>
**Faked / seeded / hardcoded:** <items — every one gets labeled in the code later>
**Cut:** <items — written down so they stay cut>

## Critical path
<the one component the demo cannot happen without> — est. <X>h, doubled: <2X>h
Owner: <who>

## Known weak points
<what a judge will find. Naming them here means nobody is surprised on stage.>

## Prize tracks we're aiming at
<sponsor categories, or "none — general track">
```

## Handoff

When the idea is locked, say in one line that `hackathon-ready` takes it from here — it handles the
comments and the four judge-facing docs during the build, and the "faked" column above is exactly what
it needs to label. Point it at `docs/IDEA.md`. Don't start doing that work inside this skill; this one
ends when the idea is decided and scoped.

## What this skill will not do

- Tell the user an idea is good because they're excited about it. They asked.
- Add a fifth feature at hour 20. If asked, say what it costs and let them decide.
- Invent facts about competitors, users, market size, or what past winners built.
- Produce a scope that only fits if nothing goes wrong. Something goes wrong.
