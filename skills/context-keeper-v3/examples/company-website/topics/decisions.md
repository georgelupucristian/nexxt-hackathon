# Decisions

## D-004 — Contact delivery architecture
- Status: active
- Evidence: [V]
- Decided: 2026-07-23
- Choice: validate on the server and hand off to the mail provider from the API route.
- Reason: client validation can be bypassed; provider credentials must remain server-side.
- Consequence: the API failure path requires browser and route-level coverage.
- Revisit when: the project adopts a managed form platform with equivalent validation and privacy controls.
- Related: `src/app/api/contact/route.ts :: POST`
