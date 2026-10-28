# Project Working Set

<!-- context-keeper:v3 -->
<!-- updated: 2026-07-25 22:00 EEST -->
<!-- base: branch=main commit=abc1234 -->

## Outcome
- [R] Launch the approved English/Romanian company site with working forms, consent-aware analytics, redirects, and accessibility checks.

## Current objective
- Finish and verify the contact flow before stakeholder review.

## Current state
- [V] Homepage and services routes pass the production build.
- [V] Contact form UI and client-side states are complete.
- [A] Server validation exists but the failure path has not been tested.
- [B] Production SMTP credentials are unavailable; Operations owns access, so end-to-end staging proof is blocked.

## Next actions
1. Add the malformed-request test in `tests/contact.spec.ts`; prove the API returns the expected error state.
2. Review `src/app/api/contact/route.ts :: POST` for logging that could expose submitted personal data.
3. When Operations supplies staging configuration, run one consent-safe end-to-end submission and record the result.

## Do not redo or change
- Approved header spacing and mobile navigation.
- The homepage production build was already verified after the latest design changes.
- Do not embed the map before analytics/marketing consent.

## Active constraints
- Preserve legacy WordPress redirects during launch.
- Romanian copy remains stakeholder-reported and unapproved.
- Never store submitted form data in logs.

## Working set
- `src/app/contact/page.tsx :: ContactPage` — public form and user-visible states.
- `src/app/api/contact/route.ts :: POST` — validation and mail handoff.
- `tests/contact.spec.ts` — missing failure-state coverage.
- `src/lib/consent.ts` — map and analytics gating.

## Verification boundary
- `npm run build` passed at commit `abc1234`.
- Contact validation failure and real staging delivery remain unverified.

## Open questions
- [?] When will Operations provide staging mail access? Source: Operations owner.
- [?] Who approves final Romanian contact copy? Source: project manager.

## Load on demand
- `topics/decisions.md#D-004 — Contact delivery architecture` — before changing form transport or validation boundaries.
- `topics/product-and-design.md#Consent and embedded services` — before changing maps, analytics, or cookies.
- `topics/integrations-and-deployment.md#Legacy WordPress redirects` — before routing or launch work.
- `topics/verification-and-issues.md#Contact flow` — before claiming the feature complete.

## Last checkpoint
- `2026-07-25 22:00 EEST` — UI completed | API failure test missing | build passed | SMTP blocked | resume with test coverage.
