# Demo

## The one-liner

<!-- What this is, in one sentence a judge can repeat to another judge. -->

## Blockers

<!-- Anything that stops the demo running AT ALL goes here, at the top, before
     anything else. Trace the happy path through the code first - if the state the
     demo depends on is never set, or a service is a stub, that is the headline.
     For each: what's broken, the smallest fix, roughly how long.

     Delete this section only when it's genuinely empty. -->

## Demo killers to check on the demo machine

- [ ] CORS — separate frontend origin, is the middleware there
- [ ] Ports and env vars set on *this* laptop, not the dev one
- [ ] Seeded state loaded (the pre-made record the demo opens on)
- [ ] Every scripted step run once, end to end, on venue wifi
- [ ] Font size bumped, window sized for a projector, checked from the back
- [ ] Laptop plugged in, notifications off, hotspot tested (not just "ready")
- [ ] Screenshots of each good result saved to the desktop as a last resort

## T-minus plan

<!-- Working backwards from the deadline. Adjust the offsets to the real slot. -->

| When | What |
|---|---|
| T-120 | Decision point: what gets cut |
| T-40 | **Hard merge freeze.** Nothing lands after this |
| T-35 | Full rehearsal on the demo machine, timed |
| T-20 | Second rehearsal, plus the 3-minute cut-down |
| T-10 | Pre-flight checklist above, then laptop closed |

## Run of show

<!-- The "what we say" column gets read out verbatim by a stressed person. Any
     specific the code can't confirm — what the sample file is, how long it is, what
     happened when — goes in as <angle brackets> for the team to fill, not as
     plausible-sounding colour. -->

| # | Time | What we do | What we say |
|---|------|-----------|-------------|
| 1 | 0:00 | | |
| 2 | | | |
| 3 | | | |
| 4 | | | |

**If we get cut short**, drop beats <n> and <n>. Never drop <the beat that shows the
core thing working> — that's the whole demo.

**Live vs pre-seeded vs hardcoded.**

| Part | Live / seeded / hardcoded |
|---|---|
| | |

<!-- Spell this out exactly. If a judge asks mid-demo, answer straight - getting caught
     hedging is fatal, saying it up front costs nothing. -->

**If it breaks.** <keyed by symptom, not by cause. who says what while it's failing.
Decide the retry-once rule now. Nobody says "that's weird, it worked earlier".>

| Symptom | What we do | Who says what |
|---|---|---|
| | | |

## Hard questions

<!-- Ten, generated adversarially. Each one grounded in a specific file:line - if you
     can't cite a line, it's a generic question and it doesn't earn a slot. Cap the
     positioning questions (competitors, business model, what's novel) at two.

     Two or three sentences each, in speakable language. Where the honest answer is
     "we don't handle that", say so and follow with what you'd do about it. -->

**Q:** <question> `<file:line>`
A:

**Q:**
A:

**Q:**
A:

**Q:**
A:

**Q:**
A:

**Q:**
A:

**Q:**
A:

**Q:**
A:

**Q:**
A:

**Q: What was the hardest bug?**
A: <ONLY a real one, from BUILDLOG.md or from the team's memory. Judges ask this
   specifically to find out whether you wrote the code. If nobody remembers one,
   leave this blank and go ask the team — an invented war story is the single most
   dangerous sentence in this document.>

## If you only memorize three things

1.
2.
3.

## Never say

<!-- The claims that are false about this project and would be caught. e.g. any claim
     that there's authentication when there isn't; naming a provider you didn't
     integrate; "it scales fine". -->

-
-

## Who did what

<!-- Judges ask this to find out whether the team actually built the thing. One line
     per person, specific. -->
