---
name: context-keeper
description: >
  Activated when the user says "use your skill", "use the skill", "skill check", "context check",
  or any close variant mid-conversation. Produces a structured mid-conversation briefing: what has
  been fully covered, what is currently in progress, and the next 4–5 topics on the agenda.
  Also triggers memory saves for any critical details needed to resume in a future session.
  Use this skill aggressively — if the user says anything that sounds like they want a conversation
  recap, status check, or "where are we?", treat it as a skill invocation.
---

# Context Keeper

Produces a structured mid-conversation status report and optionally saves key details to memory
so the user can resume seamlessly in a future chat.

---

## When this skill is invoked

The user has asked for a context check mid-conversation. They want:
1. A clear summary of what has already been resolved/completed
2. What is currently being worked on or is partially done
3. The next 4–5 topics still ahead
4. Any memory saves that would help pick things back up later

---

## How to produce the briefing

### Step 1 — Scan the full conversation

Read everything from the beginning. Mentally group messages into:
- **Closed topics**: fully discussed, decision made or task completed
- **Open/in-progress**: brought up but not yet resolved or fully answered
- **Queued**: mentioned as coming up but not yet touched

### Step 2 — Write the briefing

Use this exact structure, in plain prose with minimal formatting:

---

**📍 Context Check**

**✅ Covered so far**
A concise bullet list of topics that are done. One line each. Be specific — not "we talked about the app" but "decided on Expo + React Native stack for the loyalty app."

**🔄 Currently in progress**
What we're actively mid-discussion on right now. Usually 1–2 items. State where we left off.

**⏭️ Up next (4–5 topics)**
A numbered list of the next topics in logical order. If the user gave an agenda earlier, respect it. Otherwise infer from context. Be specific.

**💾 Memory note** *(only include this section if there's something worth saving)*
Briefly note what you're about to save to memory, and why. Then call the memory tool after the briefing.

---

### Step 3 — Save to memory if needed

After outputting the briefing, evaluate: is there anything in this conversation that would be hard to reconstruct in a future session? If yes, use the `memory_user_edits` tool to add a concise note.

**Save to memory when:**
- A non-trivial decision was made (tech choice, architecture, business logic)
- A task was completed that has a specific output (deployed function, file, workflow ID)
- A new project, entity, or credential was introduced
- The user explicitly said "remember this"

**Do NOT save to memory:**
- Exploratory discussion with no decision
- Things already in existing memory
- Temporary or throwaway context

Memory entries should be concise, factual, and in third person.
Example: "Decided to use Telnyx over Bird for telephony due to TCP/TLS support required by ElevenLabs."

---

## Tone and length

- The briefing should take ~30 seconds to read
- No excessive headers, no padding
- Write like a co-pilot handing off a shift, not like a report
- If the conversation has been very short (< 5 exchanges), say so and give a minimal summary

---

## Example output shape

```
📍 Context Check

✅ Covered so far
- Decided the loyalty app will be a mobile front-end over SmartCash's existing Fidelity module, not a loyalty logic rebuild
- Confirmed tech stack: Node.js + Express + node-firebird, Expo for mobile, Cloudflare Tunnel for HTTPS
- Identified Firebird schema analysis as the critical-path blocker before dev begins

🔄 Currently in progress
- Scaffolding the Expo app — we stopped mid-discussion on which screens to build first

⏭️ Up next
1. Finalize screen list (QR display, cashback balance, transaction history)
2. Set up Expo project structure and navigation
3. Build the Firebird → REST API bridge
4. QR signing logic (HMAC-SHA256)
5. Push notification setup via Firebase FCM

💾 Memory note
Saving the confirmed stack and Firebird blocker to memory so we can resume without re-establishing context.
```
