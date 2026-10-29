# Design research record

Research done with the Mobbin MCP (`search_screens`, `search_flows`, iOS platform) on 2026-10-28.
Only screens that were actually returned and looked at are listed. Links are Mobbin screen/flow pages.

Kept is a web app (Vite + React), mobile-first. Patterns from iOS apps were adapted to the web,
and a desktop layout (side rail + two columns) was added rather than stretching the phone layout.

---

## Home dashboard and balance card

**Searches:** "savings app home dashboard with balance card"

**Inspected:**
- [Zopa Bank – Smart Savings Hub](https://mobbin.com/screens/8e75b164-8b69-401b-8382-a363876511a9): centred "Total savings" figure with small decimals, three circular actions (Add money / Withdraw / Open a pot), list-style cards below.
- [KOHO – Total saved + goal card](https://mobbin.com/screens/9cbbefd8-063f-441d-bfc7-40e068552e7a): label above a very large figure, hide-balance eye icon, goal card with progress and "Next deposit".
- [PayPal – Savings](https://mobbin.com/screens/b5160640-0ffd-4d34-8726-65d3fc40e52b): one dark primary pill ("Add Money") next to an outlined secondary pill ("Transfer"); green success toast after adding money.
- [Dave – Goals](https://mobbin.com/screens/6b8b2f25-eaa9-40b3-a409-e98b2d190fed), [Oportun – Set & Save](https://mobbin.com/screens/34e1760c-ce3d-436f-a439-ee1a7931747c), [Neo Financial – Savings](https://mobbin.com/screens/32acb14f-deda-480d-8455-0d09c639e4f0).

**Patterns extracted:** one dominant number; decimals and currency de-emphasised; primary + secondary action pair directly under the number; eye toggle to hide the balance; source/provider line near the figure (PayPal "Banking services provided by…").

**Decisions for Kept:**
- `BalanceCard` is the only dark surface on Home, so it reads as the primary element. Big integer, small `,00 lei`.
- The source line sits right under the number: "Savings recorded manually" or "Demo connection · Last updated 42 min ago" / "Connection requires attention".
- Added a split row (In goals / Unallocated) that none of the references had — needed so a total can never be read as double-counted.
- Primary = "Record savings" (manual) or "Add money" (demo); secondary = "Details" sheet with per-goal breakdown.
- Pending money is stated in words under the figure ("+40 lei pending, not counted yet") instead of being added to it.

## Weekly calendar / streak

**Searches:** "habit tracker weekly streak calendar"

**Inspected:** [timespent – Arcs](https://mobbin.com/screens/9cc7a829-7e52-4fba-a224-d18fba39c85e) (weekday letters over icons, today marked), [QUITTR](https://mobbin.com/screens/4b72b2c9-77b9-49be-8950-2ac285957ae5) (row of 7 circles: check / cross / current), [Gymshark](https://mobbin.com/screens/7f0eef36-d323-49a3-a7b0-ae3be548cc16), [Me+ habit stats](https://mobbin.com/screens/bc859f54-d4fc-4f2c-a728-0a5f82dc2bd2), [Noom streak calendar](https://mobbin.com/screens/5c506133-1cc8-470f-b791-468980acda12) (streak count + "streak freeze" explanation), [Finch](https://mobbin.com/screens/ff1ae685-a0d9-45aa-b83e-b1314013c675).

**Patterns:** letter above, circle below; filled = done, outlined/ringed = today, dashed or empty = future; a short rule explanation near the count (Noom).

**Decisions:** 7 circles Mon–Sun with distinct states: done (moss fill + check), today (ink ring), today-done (fill + ring), missed (grey solid), break day (blue + pause icon), upcoming (dashed), before-join (blank). Subtitle "Consistency, not money" under the count. An info button opens the rules and a "Take today off" control (adapted from Noom's streak freeze, but without making it a reward). Flame kept small and only next to the count.

## Goal detail

**Searches:** "savings goal detail screen with progress"

**Inspected:** [Dave](https://mobbin.com/screens/2897d6a4-af9a-47f7-a9ed-29149f05d7f0), [PayPal goal](https://mobbin.com/screens/f8593ae5-00c1-41e3-bfa4-bc335bfa5fd7) (Transfer/Add money pair + recent activity + Edit/Delete links), [KOHO](https://mobbin.com/screens/8ce05eb0-1666-42bb-88fb-60c1429b2d62) (key–value rows: target, saved, complete by, recurring; "Next deposit"; history), [Rocket Money](https://mobbin.com/screens/4dd0e004-24b3-4efa-8e10-2af3b11251b9), [Quicken](https://mobbin.com/screens/01eb82a0-9c38-43ba-b6e7-1c71edc9e252) ("Left to save", "on track!" tag), [Cleo](https://mobbin.com/screens/9cb73cdc-e02f-4ce0-bf26-15c34118428d) (Saved vs Pending rows).

**Decisions:** big saved amount + "of X · N%" + thick progress bar + "X lei to go"; three circle actions (Add / Withdraw / Adjust plan) from Zopa; KOHO-style key–value card (Plan, Next planned, Target date, Estimated finish); a health pill ("On track" / "Plan finishes late", from Quicken) worded neutrally; history list below; destructive and rare options (pause, archive, delete, make primary) moved into a "…" sheet rather than PayPal's inline links.

## Goal creation and plan

**Searches:** flow "savings goal creation onboarding"

**Inspected flows:** [Monarch – Creating a goal (14 screens)](https://mobbin.com/flows/c2c27887-236b-4311-a244-da4362691839), [Monarch – Creating a goal (26 screens)](https://mobbin.com/flows/3e3c79c0-1088-4e6b-a5a9-976b230cbaba), [Lloyds – Creating a financial goal](https://mobbin.com/flows/b73dde8c-446c-4363-9e18-d55d101a4240).

**Patterns:** one question per screen with a large heading and short helper text (Monarch); image/category grid for goal type; Lloyds "Set your target amount" + date + a live "You'll need to save £3.85 a week / £16.67 a month" split box.

**Decisions:** onboarding uses one question per step with a 5-segment progress bar; goal types are a 2×2 option grid; `PlanForm` shows the Lloyds-style week/month split when a target date exists, plus an estimated finish date for the chosen plan, plus a line saying estimates assume every contribution happens and the plan is not an obligation.

## Amount entry

**Searches:** "add money amount entry keypad screen"

**Inspected:** [Stake](https://mobbin.com/screens/58a3245b-8ade-4843-8e5e-c14a00f28111), [bunq](https://mobbin.com/screens/3fc3c82a-f351-4bd8-a5ae-2995ec1b8abe), [Gojek](https://mobbin.com/screens/b936062e-6f14-4e21-9dbc-59be7cfd34da), [Oportun](https://mobbin.com/screens/b30c3463-208c-49e0-b8a6-5e71dda8319a) ("$7,741 available" under the amount), [Cash App](https://mobbin.com/screens/2028ff73-6093-4f97-b266-0e0fb8c060fa) (range hint, huge centred number).

**Decisions:** huge centred amount with muted currency; "available" line under it for withdrawals (Oportun); quick-amount chips including the planned amount. **Adaptation:** no custom keypad — on the web a real `inputmode="decimal"` input gives the native numeric keyboard on phones and works with a physical keyboard and screen readers.

## Activity and transaction detail

**Searches:** "banking app transaction history with filter chips", "banking app transaction detail screen with status"

**Inspected:** [Wise](https://mobbin.com/screens/3d0d5be6-d405-4ec9-ad94-e2a815e16248), [N26](https://mobbin.com/screens/b4dc5c95-c7b0-470c-add8-4ab24f73725b), [Mercury](https://mobbin.com/screens/628c4fb3-1ede-432f-be42-0d6dfd29d9c9) (inline "Pending" / "Failed" tags, struck-through failed amount), [Public](https://mobbin.com/screens/18138419-ad19-4828-9007-c65c1d2b7a70) (date-grouped list), [Shopee](https://mobbin.com/screens/3395613c-bbb6-4ed2-b490-d533d3d1029d) (All / Top up / Payment chips); details: [Neo Financial](https://mobbin.com/screens/b8f84068-14da-4da8-b24f-6320fbef86cf), [Careem](https://mobbin.com/screens/640e835f-1def-45c9-ba36-482143e02aa4) (status + explanation box), [Revolut](https://mobbin.com/screens/b7a4d4f5-b5a7-4f95-a39e-84e7a258996c), [Marcus](https://mobbin.com/screens/7223cee8-9306-4005-96f1-b2f79922a62e) (centred amount + Status/Date/Category rows).

**Decisions:** horizontally scrolling filter chips (All / Contributions / Withdrawals / Pending & failed) + goal select; groups by day with the day's net; every row carries exactly one status pill (Manual / Simulated / Pending / Failed); failed amounts are struck through (Mercury). Detail: centred amount (Marcus), an explanation banner for pending/failed/simulated (Careem), key–value rows for status, source, goal, date, recorded time. Only manual entries get Edit/Delete.

## Welcome

**Searches:** "fintech app welcome screen with sign up and log in buttons"

**Inspected:** [Fidelity](https://mobbin.com/screens/bd336b9d-45a0-4d9d-b77c-43be61909c49), [Wise](https://mobbin.com/screens/84b41552-3303-4521-a758-1eaa96419548), [Monarch](https://mobbin.com/screens/f7276c87-9f71-4d4c-9a6d-7001df30d67a) (product preview card + benefit headline), [KOHO](https://mobbin.com/screens/f900152d-6a34-4159-b0b6-a2f390524de3), [Revolut](https://mobbin.com/screens/728e3b53-7050-4a14-8349-c4555bb0c3fa).

**Decisions:** Monarch-style preview of the product (a tilted example goal card, labelled "Example goal") above a bold benefit headline; stacked actions at the bottom: Create account (primary), Sign in (secondary), Explore with sample data (ghost).

## Connecting an account / permissions

**Searches:** "connect bank account permission explanation screen"

**Inspected:** [Plum](https://mobbin.com/screens/8a45a4fb-10de-40a8-8f26-9ada5fbc28a0), [Monzo](https://mobbin.com/screens/ae9c6069-35d6-4377-9573-a9b3fb1f633b), [Betterment](https://mobbin.com/screens/bbe379eb-26bc-41ac-9b79-184494a19ac0), [Cleo](https://mobbin.com/screens/96712606-5aa5-4393-95bd-f370ff115e6c) (checklist: read-only access, never sell data, unlink anytime).

**Decisions:** the tracking step explains what the demo connection does as an icon checklist (Cleo/Plum pattern) — but the content is honest: everything is simulated, no bank is contacted, no money moves. A "Connect a real bank" row is shown disabled with "Not available in this version" rather than faked.

## Profile and settings

**Searches:** "finance app profile settings screen"

**Inspected:** [Plum](https://mobbin.com/screens/93449b88-eaf3-415a-afbd-af5fbcdec487), [Cash App](https://mobbin.com/screens/110068c2-2e43-4f51-a7c5-6cd6bc1e90ba), [Zing](https://mobbin.com/screens/787f9aba-1183-4a36-81ad-efcb9bfdf09c), [Kraken](https://mobbin.com/screens/6a942e3e-95dd-4733-ab9f-1067d6e73206) (avatar + name/email header, grouped sections with icon-in-circle rows and right-side values).

**Decisions:** avatar header, then three grouped lists (Savings / Account / Support) with icon circles and current values on the right (Kraken), sign out as a separate button at the bottom (Zing).

## Reminders

**Searches:** "onboarding set reminder time screen"

**Inspected:** [Mimo](https://mobbin.com/screens/49b87ed7-101a-418f-921d-ea8725debd9e), [Uxcel Go](https://mobbin.com/screens/c132292c-29be-4abb-97cc-f79c3caacd87) ("Save & continue" + "I'll do this later"), [pillowtalk](https://mobbin.com/screens/9c1eb60a-3da1-48a9-a1ea-15f9860b6849), [Ahead](https://mobbin.com/screens/82507060-99c2-4662-9495-011e1048ad43).

**Decisions:** "You can always change this later" framing; Continue + "Skip reminders" pair (Uxcel). Adapted: weekly not daily, day picker + time input, and a note that reminders are in-app only (no push in this version).

## Empty states

**Searches:** "savings goals list empty state"

**Inspected:** [KOHO](https://mobbin.com/screens/602e8535-cbe1-41ec-b09b-b0b67967bc69), [Quicken](https://mobbin.com/screens/2adf1492-2f7c-4b72-8d26-51e1ebb97008), [Satispay](https://mobbin.com/screens/269ec901-0c4d-491e-9285-d6a9572b70d0), [Target](https://mobbin.com/screens/96963c70-4e2d-489a-8fc8-038cca04bedd).

**Decisions:** small icon in a soft circle, one-line title, one sentence, one primary button (KOHO). No fabricated activity.

## Weekly summary

**Searches:** "weekly money summary screen money in money out"

**Inspected:** [Lloyds spending insights](https://mobbin.com/screens/0b99d61a-891f-40a0-8615-30e27f55a204), [Apple Wallet](https://mobbin.com/screens/82a32fee-bf5f-4c39-b4b8-0e002de68d4c), [Revolut Business](https://mobbin.com/screens/71f89183-3c55-4182-9452-1a872583c0b6), [Ubank](https://mobbin.com/screens/9bbc33b2-7e59-49b5-8c8b-fb3da8f1918b) (simple "In / Out" for "This week").

**Decisions:** followed Ubank's plain numbers over Apple/Revolut's bar charts: a 2×2 grid (Started at, Net change, Contributions, Withdrawals) plus one line of goal progress before → now. No chart.

---

## Design system summary

Tokens in `src/styles/tokens.css`: warm paper background `#f5f3ee`, ink `#15201b` for primary actions and the balance card, a single moss accent `#1e6b4a` for growth and progress, a violet `--demo` colour used **only** for simulated data so it is never confused with real-money colours. 4-pt spacing, radii 10/14/20/28, pill buttons 52 px tall, 44 px minimum touch targets, Inter with tabular numbers for all money. Motion 120–360 ms, disabled by `prefers-reduced-motion` or the in-app "Reduce motion" setting.

## Not researched / limitations

- Mobbin searches were iOS only; the desktop layout (side rail, two-column Home) follows general web conventions, not a specific reference.
- No reference covered "break day" for a savings streak specifically; it adapts Noom's streak-freeze idea without the reward mechanic.
