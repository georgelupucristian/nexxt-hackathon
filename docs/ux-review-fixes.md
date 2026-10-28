# UX review: 40 issues and what changed

Branch `kept-original` (from `5c19ff0`, before the Avansul rewrite). The circular navigation stays, as asked, but it moved into Kip's floating dial. Home is now a normal reading-order page.

| # | Issue | Fix |
|---|---|---|
| 1 | Circular nav takes a third of the screen | Navigation is Kip's floating dial (72 px closed, ring only when tapped). Home's circle is now a goal-progress ring with real information. |
| 2 | No reading order | Home reads top to bottom: savings → today's step → goal → check-ins → activity. |
| 3 | Empty top third | Compact greeting; content starts right below it. |
| 4 | Unbalanced three columns | Two columns on laptop (1.1fr / 1fr), one on phone, same card system in both. |
| 5 | Header disconnected | One left-aligned header block; the floating seal avatar and streak chip are gone from it. |
| 6 | Centre circle too heavy | Flat white card, 12 px track ring, no gradient or stacked shadows. |
| 7 | No consistent design language | One card style (white, 1 px line, radius 16, no shadow) and one flat button style everywhere. |
| 8 | Too many gradients | Removed all decorative gradients (background glows, arc fills, orb, buttons). |
| 9 | Shadows inconsistent | Shadows only on floating things: dial, panels, sheets, toasts. |
| 10 | Borders don't match | 1 px `--line` on every card; no thick white strokes or 3D bottom edges. |
| 11 | No typography system | Fixed scale in tokens: 13 / 14 / 15 / 17 / 22 / 28 / 36; display face only for headings and key amounts. |
| 12 | Poor readability | Muted text raised to ≥ 4.7:1 contrast; nothing below 13 px. |
| 13 | Colours have no meaning | Moss = action/progress/saved money, amber = pending or behind, red = failed, blue = info/simulated. Section colours removed. |
| 14 | Too rounded and too rigid | Radius scale 10 / 12 / 16 / 20; pills only for status tags. |
| 15 | Navigation mixes categories | Dial has four places: Home, Goals, Activity, Profile. "Today" folded into Home. |
| 16 | Profile duplicated | Header avatar removed; Profile only in the dial. |
| 17 | No active state | Current section's segment is pushed out and filled; a label under Kip names the current place. |
| 18 | Ambiguous plus button | Removed. Explicit "Record savings" / "Record 100 lei I set aside" buttons. |
| 19 | Two competing primaries | One primary per view: the next step's button; "Record savings" turns secondary when a step owns the primary. |
| 20 | Radial nav interaction cost | Dial labels are text + icon, keyboard accessible, and open with one tap; Home itself no longer needs it. |
| 21 | Inconsistent clickability | Links are moss text; clickable cards have a chevron; buttons look like buttons. |
| 22 | Responsive concerns | Single column ≤ 960 px, ring stacks above figures ≤ 420 px, dial clamps itself on-screen. |
| 23 | No financial information architecture | Overview separates: saved and confirmed, in goals, not assigned, pending (not counted). Goal card adds plan, target date, estimated finish, left to save. |
| 24 | "165 lei planned for today" ambiguous | "Today is one of your savings days. Your plan for X is 100 lei every Friday." |
| 25 | "Record it" unclear | "Record 100 lei I set aside", plus "Kept never moves money. It records what you set aside." |
| 26 | Repeated information | Total shown once (overview); goal amounts only in the goal card; planned amount only in the next step. |
| 27 | Goal card lacks context | Plan, target date, estimated finish, left to save, status pill. |
| 28 | No financial insight | One sentence: on track, early, or "finish ~7 weeks late; 124,67 lei a week gets you there on time." |
| 29 | Tracking vs saving unclear | Note on the overview: "You record money you set aside yourself. Kept keeps count; it doesn't hold or move money." |
| 30 | Useless empty state | Says what appears, how to create it, and offers the button. |
| 31 | Streak has no clear purpose | Renamed "Check-ins", kept separate from money, explained in one line. |
| 32 | Calendar doesn't communicate | Legend: saved or checked in / today / break / no action; upcoming days dashed. |
| 33 | "1/4" with 14 bars | Only on first use: "Setup: 2 of 4 done" with exactly four segments. |
| 34 | Gamification competes | Check-ins moved below the money; confetti removed; Kip only reacts. |
| 35 | Streak punishes no income | "Missing one never touches your money, and you can mark a break any time." |
| 36 | No brand identity | Kip on moss as the app icon and in the dial; student goals (laptop, Erasmus, emergency fund). |
| 37 | "Hello, hk" looks like a test account | Greeting capitalises the name. |
| 38 | Mascot not integrated | Kip is the navigation and says today's step inside the next-step card. |
| 39 | Novelty over credibility | Calm, flat visuals; every number labelled with what it counts. |
| 40 | No first-use guidance | First-time users see one focused card: how Kept works in three steps, setup progress, one button. |

Also fixed: 3D emoji replaced by one Lucide icon set; Kip's waving pose no longer rocks the whole body; random fidgets every 6–11 s instead of 2.5–5 s.
