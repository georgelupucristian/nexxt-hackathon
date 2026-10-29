# Assumptions, data sources, regulation and limits

What the Kip demo takes for granted, where its numbers come from, which rules apply, and what it does not do yet. Status: 28 October 2026. This is our research, not legal advice; items marked *(to confirm)* need a Romanian payments lawyer, and *(secondary)* means we found the figure in press coverage, not the primary source.

## 1. Assumptions

### Users

| Assumption | Value in the prototype | Why |
|---|---|---|
| Who | Students and young adults in Romania, **18 or older** | Minors are excluded (see section 3). Roughly 433,000 people study for a bachelor's degree in Romania (INS, 2024/2025). |
| Device | A smartphone with a modern browser; the app installs as a PWA | No app-store release needed for a pilot. |
| Payment method | A personal bank card (Visa or Mastercard) | Nearly every student has one. Revolut Pay could be switched on later; SEPA Direct Debit is EUR only, so it does not fit RON accounts. |
| Parent | Optional. An adult with a card who chooses to match savings | The parent needs no account, only a private link. |
| Language and time | Romanian UI, money days in Europe/Bucharest | "Today" must be the student's day. |

### Amounts

| Item | Range | Default |
|---|---|---|
| Daily saving amount | 5 to 50 lei a day | 15 lei a day |
| Monthly charge | daily amount x 30, on payday | 450 lei |
| Payday | day 1 to 28 of the month | chosen by the student |
| First charge | daily amount x days until payday | e.g. 13 days = 195 lei |
| Extra deposit | 2 to 5,000 lei | added to the next charge, no extra fee |
| Parent match ratio | 1:4 to 4:1 | 1:1 |
| Parent monthly cap | 10 to 5,000 lei | 150 lei |
| Smallest match charged | 2 lei (Stripe's minimum charge in RON) | |

All amounts are whole bani (1 leu = 100 bani). Projections are in today's lei: no interest, no inflation. With annual inflation at 8.2% in July 2026 (INS, *secondary*), a goal set a year out will cost more in real terms; the app does not adjust for this yet.

### Behaviour

- Students respond better to a small amount **per day** than to the same money per month, so the plan is shown per day and collected monthly (Hershfield, Shu and Benartzi 2020: 29.9% sign-up vs 7.1%).
- Students keep going if they can **pause, lower or skip** without penalty; there is no lock-in on their own money. Hard commitment devices help a minority and can hurt over-confident savers (Ashraf, Karlan and Yin 2006; John 2020).
- **At most one reminder a week.** In a Romanian field experiment, reminder and peer-comparison texts *reduced* saving among people with goals (Andrieș and Walker; one study, rural adults, so we treat it as a design constraint rather than proof).
- A **parent match** raises take-up (Duflo et al. 2006: 3% with no match, 8% with 20%, 14% with 50%), but most people still need a default plan as well.
- People save more with **one labelled goal** than with several (Soman and Zhao 2011), so Kip puts one primary goal first.

## 2. Data sources

### Context figures

| Figure | Source |
|---|---|
| 18% of EU adults have high financial literacy; Romania has one of the highest shares with low knowledge (30%) *(secondary)*; 51% of Romanians rate their knowledge above average, 13% score high | Flash Eurobarometer 525, 2023: https://europa.eu/eurobarometer/surveys/detail/2953 |
| International adult financial literacy survey, 39 countries (no Romania youth figure found; used for method only) | OECD/INFE 2023: https://www.oecd.org/en/publications/oecd-infe-2023-international-survey-of-adult-financial-literacy_56003a32-en.html |
| Lowest trust in banks in Central, Eastern and South-Eastern Europe; a majority prefer saving in cash | OeNB Euro Survey 2023: https://www.oenb.at/en/Publications/Economics/reports/2024/report-2024-12-euro-survey/html-version.html |
| 78% of Romanian Gen Z say they can't afford a home; 55% feel financially insecure | Deloitte Gen Z and Millennial Survey 2026, Romania: https://www.deloitte.com/ro/en/about/press-room/deloitte-study-80-of-young-romanians-cannot-afford-to-own-a-home-cost-of-living-remains-their-biggest-concern-followed-by-political-instability-and-corruption1.html |
| Only 26% of Romanian consumers feel financially comfortable (48% globally) | PwC Voice of the Consumer 2026, via Economica: https://www.economica.net/?p=980480 |
| 432,907 students enrolled in bachelor's programmes, 2024/2025 *(secondary)* | INS data via Edupedu, 29 Sep 2025: https://www.edupedu.ro/numarul-studentilor-la-licenta-a-crescut-in-ultimul-an-cei-mai-multi-sunt-inscrisi-la-afaceri-drept-inginerie-medicina-cresterea-incetineste-in-cazul-stiintelor-educatiei-ultimele-date-ins/ ; INS education statistics: https://insse.ro/cms/ro/content/statistica-educa%C8%9Biei |
| Average net wage 5,820 lei (July 2026); annual inflation 8.2% *(secondary)* | INS data via Financial Intelligence: https://financialintelligence.ro/castigul-salarial-mediu-net-pe-iulie-2026-la-cota-25-in-termeni-reali/ |
| Licensing authority for payment and e-money institutions; FinTech Innovation Hub; RON reference exchange rates | BNR: https://bnr.ro/apage.aspx?pid=20332 ; rates: https://www.bnr.ro/nbrfxrates.xml |

### Stripe pricing used for the fee maths (Romanian account, standard pricing)

| Item | Fee | Source |
|---|---|---|
| Standard EEA card | 1.5% + 1.00 leu | https://stripe.com/en-ro/pricing |
| Premium EEA card | 2.8% + 1.00 leu | same |
| Billing (subscriptions) | 0.7% of billing volume | https://stripe.com/en-ro/billing/pricing |
| Connect | 10 lei per active account a month; payouts 0.25% + 1.50 lei | https://stripe.com/en-ro/connect/pricing |
| Minimum charge | 2.00 RON | https://docs.stripe.com/currencies |
| Refunds | no fee, but the original fee is not returned | https://docs.stripe.com/refunds |

**Why we batch.** Thirty daily card charges of 15 lei cost 36.75 lei in card fees (8.2% of 450 lei). One monthly charge of 450 lei costs 7.75 lei (1.7%). Billing adds 0.7% either way.

The full research, with every source, is in `research/legal-and-payments.md` in the main repository.

## 3. Regulatory considerations

| Topic | What applies | What Kip does |
|---|---|---|
| **Holding customers' money** | Taking deposits is reserved for banks (CRD Art. 9; OUG 99/2006 Art. 5 in Romania). BNR decides, with binding effect, whether an activity counts. | Kip does not hold money in production. A licensed partner does (section 4). *(to confirm)* |
| **Payment services: PSD2, Law 209/2019** | Only licensed payment service providers may offer payment services. A payment institution needs EUR 125,000 initial capital and may not take deposits. We found no small-institution waiver in Romanian law. *(to confirm)* | Kip would act as the partner's agent or as a technology layer, never as the payment provider. |
| **E-money: EMD2, Law 210/2019** | An e-money institution needs EUR 350,000 initial capital and may not pay interest or any benefit for holding e-money. | Not pursued; a bank deposit in the student's name fits savings better (interest allowed). |
| **Strong customer authentication** | PSD2 requires SCA for card payments; later charges can be merchant-initiated after a mandate. | Stripe Checkout handles 3-D Secure on the first payment and on saving the parent's card; renewals and matches run off-session on that mandate. |
| **KYC and AML** | Romanian AML law (Law 129/2019); the EU AML Regulation 2024/1624 applies from July 2027. | Identity checks are the licensed partner's job (ID, address, selfie); with Connect on, Stripe would also verify each student's connected account. Kip keeps an audit trail: every money row links to a Stripe object. |
| **GDPR** | Lawful basis, minimisation, EU hosting, access and deletion rights. | Data hosted in the EU (Supabase eu-west-3, Paris). We store first name, birth date, city, goals and amounts, no ID documents. Row Level Security keeps each student's data private. A DPIA is planned before handling real money. |
| **Minors** | Contracts, payment accounts and partner KYC for under-18s need parental consent and a different product. | **Excluded.** Kip is for adults only. Parents take part as adults through their own link. |
| **Consumer protection and design** | Directive 2023/2673 (distance financial services) bans manipulative interface design from 19 June 2026. | Pause, lower and cancel are always one tap; celebrations only for real money; no leaderboards. |
| **PSD3 / PSR** | Not yet law. Council first-reading position 21 October 2026; Parliament's plenary vote indicatively 14 December 2026; likely applies around 2028. | Built for today's rules (PSD2, EMD2). PSD3 folds e-money institutions into payment institutions, which may widen partner options later. |
| **Stripe's own terms** | Escrow, stored value and money transmission are restricted; Connect manual payouts must go out within 90 days in Romania. | Stripe Connect is not used as a long-term savings vault in production. |

**Sandbox route.** BNR runs a FinTech Innovation Hub (guidance, not a regulatory sandbox), and on 12 October 2026 BNR signed a cooperation protocol with RoFintech. Our first step after the hackathon is a written legal opinion and a request to the Hub.

## 4. Path to production

| Stage | What | Who holds the money |
|---|---|---|
| 0. Hackathon (now) | Full flow in a Stripe sandbox (test mode) | Nobody (test money) |
| 1. Pilot | Tracker and coach: savings stay in the student's own bank account, Kip records and nudges; Kip's own optional subscription is the only real charge | The student's bank |
| 2. Verified tracking | Read-only open banking through a licensed aggregator, so progress is checked automatically | The student's bank |
| 3. Kip-branded pots | Partnership with a Romanian bank (deposit in the student's name) or an e-money institution with RON support, Kip as agent or distributor | The licensed partner |

## 5. Limitations

- **No licensed partner signed yet.** Stage 3 is a plan, not a contract.
- **Payments run in a Stripe sandbox (test mode).** No real money moves. The real-money app (branch `feat/real-money`) shows no "test mode" labels on screen, so nothing in the app itself says it: pay with Stripe's test card **4242 4242 4242 4242, any future expiry date, any CVC**. 4000 0000 0000 0341 declines on renewal, to show recovery. Checkout lists the products under the Kip name (for example "Kip: depunerea lunară").
- **Email addresses are not verified in the demo.** Supabase email confirmation is switched off (`mailer_autoconfirm`), so anyone can sign up with any address and reach Checkout at once. It goes back on before launch, next to the partner's KYC.
- **Checkout returns only to known addresses.** After paying, Stripe sends the student back to the address the request came from (`appUrl(req)` in `supabase/functions/_shared/env.ts`, branch `feat/avansul`), but only when that is the configured `APP_URL`, localhost or a `*.vercel.app` preview; any other origin returns to `APP_URL`. A live site on its own domain must be set as `APP_URL`.
- **Stripe Connect is not enabled** on the platform account, so there is no per-student connected account yet; test payments land on the platform balance and the ledger tracks each student's share.
- **Withdrawals are simulated** payouts (ledger rows only), because a real payout needs Connect or a partner and live bank details.
- **The demo button uses simulated money.** "Încearcă cu date demo" opens a sample account with eight weeks of made-up history, stored only in that browser.
- **Time travel is a test feature.** Stripe test clocks advance at most two billing periods at a time and hold at most three customers each.
- **No bank connection.** Kip cannot see the student's bank balance; that needs a licensed aggregator (stage 2).
- **Card only.** No RoPay, bank transfer or Revolut Pay yet; SEPA Direct Debit is EUR only.
- **Age check.** The current Kip sign-up does not yet ask for a date of birth (the earlier onboarding did, and the backend stores `birth_date`); it must come back before any real launch, ideally verified by the partner's KYC.
- **Daylight saving.** The nightly job runs at a fixed UTC time; it has to be moved by an hour at the end of March, by hand.
- **No push notifications.** Reminders appear inside the app.
- **Figures marked *(secondary)* or *(to confirm)*** have not been checked against a primary source or by a lawyer.
- **Accessibility and performance** findings from the automated audit are listed in [audit.md](audit.md) and are not all fixed.

## 6. Where the money goes, now and in production

**In this prototype (Stripe sandbox, test money only).** The student's card is charged through Stripe Checkout and the money lands in Kip's own Stripe test balance. Kip's ledger records it as the student's savings, and a withdrawal is simulated. The card exists only because a card payment is the fastest way to move money in a prototype. Holding real client money like this would make Kip a deposit-taker or e-money issuer (BNR licence), so it is NOT how the live product works.

**In production.** Kip never holds money:
1. A licensed partner bank (target: Libra Internet Bank) opens a savings account in the student's own name. Kip is the app and introducer, not the bank.
2. Money moves from the student's current account into that savings account through open-banking payment initiation (PSD2, with the student's consent in their bank app) or a standing order. A card is optional, not required.
3. Kip reads the balance through the bank's API (PSD2 account information) to show progress, streaks and goals. Withdrawals are transfers from the student's savings account back to their current account, made by the bank.

## 7. Weekly collections when the money isn't there

The student picks a weekly or monthly collection. If a collection fails because the card or account doesn't have enough (e.g. 40 lei planned, 30 available):
- **Today:** Stripe's automatic retries for failed subscription payments try again on later days (configured in Stripe Billing, Revenue recovery). The app shows the payment as failed, keeps the plan, and offers "Change card". A card charge is all or nothing, so 30 of 40 lei can't be taken.
- **Planned, not built:** retry until the money is there, take what's available and carry the rest to the next collection, or let the student "skip this week" or lower the amount for one week. None of this changes the streak rule: a day counts only when the daily amount actually goes in.
