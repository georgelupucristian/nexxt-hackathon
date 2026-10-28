# Comment style guide

Contents:
- [The voice](#the-voice)
- [What earns a comment](#what-earns-a-comment)
- [What never earns a comment](#what-never-earns-a-comment)
- [Side-by-side examples](#side-by-side-examples)
- [Density and rhythm](#density-and-rhythm)
- [Docstrings and file headers](#docstrings-and-file-headers)
- [Per-language notes](#per-language-notes)
- [Tags](#tags)
- [Self-check](#self-check)

---

## The voice

The target is a competent developer typing a note to whoever reads this next — often themselves at 4am. That produces a specific texture:

- lowercase first letter, no full stop at the end
- contractions everywhere: `doesn't`, `we're`, `it'll`
- short. most comments are under twelve words
- "we" and "I" are fine and normal
- mild frustration is fine: `redis client reconnects on its own, ours didn't, hence the wrapper`
- no emoji, no exclamation marks, no ASCII art banners
- no hedging phrases like "it is worth noting that" or "this is important because"

Two exceptions to lowercase: proper nouns and identifiers keep their real casing (`Postgres`, `useEffect`, `OAuth`), and a comment that's a full multi-sentence paragraph can use normal sentence punctuation — but those should be rare, maybe one or two per project, reserved for genuinely subtle machinery.

## What earns a comment

- **A decision with an alternative.** why this and not the obvious other thing
- **A constraint from outside the code.** rate limits, API quirks, a hardware limit, the sponsor's API returning 200 on errors
- **A landmine.** something that looks safe to change and isn't
- **Non-obvious math or a magic number.** where 0.85 came from
- **A workaround.** what was tried, what broke, what this does instead
- **An intentional omission.** the validation that isn't there and why that was OK for now
- **Something faked for the demo.** always, without exception, so nobody is surprised on stage

## What never earns a comment

These are the AI tells. If a comment is any of the following, it should not exist:

- restating the line below (`# increment the counter`, `// loop over users`)
- restating the function signature above the function
- narrating structure (`// Step 1: validate input`, `// --- HELPERS ---`)
- stating the obvious purpose of a well-named thing (`// this function saves the user` above `saveUser`)
- generic error-handling narration (`// handle any errors that occur`)
- ceremonial section dividers made of `=====` or `*****`
- a docstring on every trivial private function

The test: cover the comment, read the code. If you learned nothing from uncovering it, delete it.

## Side-by-side examples

**Slop → real**

```python
# Calculate the similarity score between the two embeddings
score = np.dot(a, b) / (norm(a) * norm(b))
```
```python
# cosine not euclidean - the embeddings aren't normalized and euclidean
# was ranking long documents way too high
score = np.dot(a, b) / (norm(a) * norm(b))
```

```javascript
// Set the timeout to 5000 milliseconds
const TIMEOUT = 5000;
```
```javascript
// 5s because the sponsor's API p99 is around 3.2s, anything tighter
// and we were dropping good responses
const TIMEOUT = 5000;
```

```python
# Retry the request if it fails
for attempt in range(3):
    ...
```
```python
# their api 429s hard during the demo window (everyone's hitting it),
# backoff is jittered so the whole team's laptops don't retry in lockstep
for attempt in range(3):
    ...
```

```typescript
/**
 * Processes the user data and returns the result.
 * @param user - The user object
 * @returns The processed result
 */
```
```typescript
// normalizes the two auth providers into one shape - google gives us
// `given_name`, github gives us `name` with everything jammed together
```

```go
// Create a new mutex
var mu sync.Mutex
```
```go
// guards the in-memory session map - we skipped Redis, single instance
// for the demo, this is the first thing that breaks if we scale out
var mu sync.Mutex
```

**Comments that carry the architecture** — these are the ones judges quote back at you:

```python
# we poll instead of using their webhooks because webhooks need a public
# url and we're on hotel wifi behind NAT. polling costs us ~4s of latency
# which is fine for this, would not be fine in prod
```

```javascript
// state lives in the URL, not in a store. sounds weird but it means the
// judges can refresh mid-demo and not lose anything, which already saved us once
```

```python
# HACK: hardcoded to the 3 demo users. real version would hit the /users
# endpoint but their sandbox only has these 3 seeded and we found out at 1am
DEMO_USERS = ["alice", "bob", "carol"]
```

## Density and rhythm

Comment density should track difficulty, not line count. In practice, across a project:

- the core algorithm / the clever bit: comment heavily, maybe one comment per three or four lines
- glue, config, routing, plain CRUD: usually zero comments
- integration boundaries (any place you touch someone else's API): one comment explaining what that API actually does versus what its docs claim
- the file everyone will open first: a short header (see below), then normal density

Uniform spacing of comments is the loudest machine signal there is. Two functions in a row with no comments, then a dense block, is what real code looks like.

## Docstrings and file headers

Docstrings are not the same thing as comments and shouldn't be swept up in the lowercase style. Use them where they earn their place:

- **public API / anything another teammate calls**: one-line docstring, plain sentence, normal capitalization. Skip the `@param`/`@returns` boilerplate unless the types aren't already in the signature.
- **private helpers, obvious functions**: no docstring
- **entry-point files** (`main.py`, `server.ts`, `App.tsx`): a three-to-five line header comment saying what this file is and how it fits into the whole. This is the single highest-value comment in the repo for a judge skimming the code.

Example header:

```python
# ingest pipeline: pulls transcripts off the queue, chunks them, embeds,
# writes to pgvector. the chunking is the part that matters - see chunk.py.
# runs as a separate process from the api so a slow embed doesn't block requests
```

## Per-language notes

- **Python**: `#` comments, docstrings only on public functions and modules. Don't type-annotate for the comment's sake.
- **JS/TS**: `//` for almost everything. Reserve `/** */` for exported functions in a shared module.
- **Go**: godoc convention wants the comment to start with the identifier name and be a sentence — follow that for exported symbols, use the casual style for everything inside function bodies.
- **Rust**: `///` doc comments follow the normal Rust convention; `//` inside bodies is where the human voice goes.
- **SQL**: `--` above any query that isn't a plain select, explaining the join or the index it depends on.
- **YAML / Dockerfile / config**: comment every value that a human picked. Config files are pure magic numbers and are the easiest place to lose a judge.

## Tags

Use sparingly, and honestly:

- `TODO:` something genuinely intended, ideally with who or when
- `HACK:` this is bad and we know it — pair it with why it was acceptable
- `NOTE:` context that isn't a warning
- `FIXME:` a known bug, present and unfixed

Do not use `XXX:`, and don't invent new tags. Between three and eight of these across a hackathon project reads as honest. Zero reads as generated. Thirty reads as abandoned.

## The sweep for fakes

Do this as a deliberate pass, not as something you hope to notice in passing — in testing, a commenting run that scored well on everything else walked straight past a hardcoded three-user allowlist standing in for authentication.

Go looking for: literal allowlists and magic IDs, `if user ==` / `if env ==` shortcuts, seeded or sample data, stubbed functions that return a constant, feature flags pinned on, credentials or URLs pointing at a sandbox, and anything named `demo`, `test`, `sample`, `fake`, or `tmp`. Every one gets a comment saying what it is and what the real version would be, and every one goes on the live-vs-faked table in `DEMO.md`.

The reason this matters more than it looks: the team stops seeing these after about hour six. The judge sees them immediately.

## Self-check

After a commenting pass, reread and ask:

1. Is any comment here reporting an experience rather than explaining a mechanism? Mechanism is verifiable from the code and always allowed. Experience — "the provider rate-limited us hard during testing", "which is why this feels slow", "it saved us building an index", "we never checked whether these are normalized", "too big to fix tonight" — requires somebody to have been there. These read as candid, which is exactly why they slip past. Cut the clause or drop the tense.
2. Did a `<fill this in>` placeholder end up in a source file? Those belong in docs. In code, write an honest `TODO:` in the normal voice instead.
3. Did you do arithmetic in a comment? Check it. A wrong number in a confident comment is worse than no number.
2. Could any comment be pasted into an unrelated project unchanged? That means it's generic — delete or make it specific.
3. Is the density flat across the file? Thin out the easy parts.
4. Does every hardcoded or demo-only value say so?
5. Are the comments a person could not have known — API behavior, timing, what broke — actually present? Those are the ones that prove understanding.
