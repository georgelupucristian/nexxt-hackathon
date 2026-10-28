---
name: frontend-ux-regression-tester
description: Review frontend UI, UX, responsiveness, accessibility, visual polish, loading states, forms, and regression risks. Use when asked to make the site look better, QA the frontend, polish UI, or test user flows.
---

# Frontend UX Regression Tester

Review the app like a user with no patience, no context, and a sacred mission to click the one thing the developer forgot existed.

## Review order

1. Identify the route/component/flow.
2. Read current UI code and design patterns.
3. Check layout at desktop, tablet, and mobile sizes.
4. Check empty, loading, success, error, and permission-denied states.
5. Check form behavior.
6. Check accessibility basics.
7. Check regressions against existing features.

## UI checklist

- clear page hierarchy
- visible primary action
- no layout shifts during loading
- no overflowing cards/buttons/text
- responsive grid or stack
- readable contrast
- consistent spacing
- consistent button styles
- disabled/loading state on submit
- understandable errors
- empty state tells user what to do
- long names/emails/phone numbers do not break layout
- modals trap focus and close correctly
- toasts are not the only source of important info

## Form checklist

- required fields marked
- validation before submit
- server errors shown near relevant fields
- submit button disabled during request
- duplicate submit prevented
- dirty state handled
- reset/cancel behavior clear
- date/time inputs respect timezone
- phone/email validation not absurdly strict

## Accessibility checklist

- keyboard navigation works
- visible focus states
- labels connected to inputs
- buttons are real buttons
- interactive icons have accessible names
- headings follow a sane order
- dialogs announce title/purpose
- color is not the only signal

## Regression workflow

Before changing UI:
- search for shared components
- identify affected pages
- check tests/snapshots if any
- make smallest consistent change
- run relevant lint/test/build
- document changed visual behavior in `.claude/progress/QA_STATE.md`

## Output

Return:
- top UI issues by severity
- quick wins
- risky redesign areas
- exact files to change
- test plan after changes
