# Kip ("Avansul"): legal, payments and behavioural research

Status date: 28 October 2026. This is research, not legal advice. Items marked **[Lawyer to confirm]** need a Romanian payments lawyer. Items marked **[Unverified]** come from secondary sources or could not be checked against a primary source.

## TL;DR

- Collecting students' money and keeping it until a goal is reached, then giving it back, is a regulated activity. In the EU it is either **deposit-taking** (banks only), a **payment service** (licensed payment institution) or **e-money issuance** (licensed e-money institution). Calling it "not revenue" in the books does not change this. Kip's original idea (money goes in, sits, comes back to the same person, no payments to third parties) looks most like deposit-taking, which only a bank may do. **[Lawyer to confirm]**
- Romania does not appear to offer a "small payment institution" or "small e-money institution" waiver; we found none in Law 209/2019 or Law 210/2019. **[Lawyer to confirm]** Full licences need EUR 125,000 (payment institution) or EUR 350,000 (e-money institution) of initial capital, and realistically 9 to 12+ months.
- "Marketplace + refunds" fails twice: the commercial-agent exclusion needs a real sale of goods or services between two parties (Kip has none, the student is both payer and payee), and Stripe refunds can only go back to the original card, can't exceed the original charge, and don't return Stripe's fee.
- The "7 day max" is real but is about **card authorisation holds** (about 7 days) and Romania's **first payout** (7 calendar days). Stripe Connect manual payouts let funds sit on a connected account for **up to 90 days** in Romania, but using Connect as a savings vault conflicts with Stripe's restricted list (escrow, stored value, money transmission) and with the law.
- PSD3/PSR is **not yet law**: the Council's first-reading position is dated 21 October 2026, Parliament's vote is indicatively 14 December 2026, and the new rules would apply around 2028. PSD2 (Law 209/2019) and EMD2 (Law 210/2019) apply today.
- Best model now: **tracker + nudge** (money stays in the student's own bank savings account), later **open banking read access through a licensed aggregator**, and only later a **bank or EMI partner** if Kip-branded pots are needed.
- Fees: Stripe in Romania is **1.5% + 1.00 leu** per standard EEA card payment. Ten 20-lei card deposits cost 13.00 lei (6.5%); one monthly 200-lei charge costs 4.00 lei (2%); a transfer into the student's own savings account typically costs 0.
- Evidence says money does **not** need to be locked away by Kip. Labelled goals, fewer goals, defaults, goal-specific reminders and a match carry most of the effect. Hard locks help a minority and can hurt over-optimistic users.

---

## 1. Legal: what is it called, who may do it

### 1.1 Three legal boxes for "holding users' money"

| Activity | EU law | Romanian law | Who may do it |
|---|---|---|---|
| Taking deposits or other repayable funds from the public | CRD Art. 9 bans this for anyone except credit institutions ([CRD Art. 9](https://www.legislation.gov.uk/eudr/2013/36/article/9)) | OUG 99/2006 Art. 5(1) bans it for non-credit institutions; BNR decides, with binding effect, whether an activity counts (Art. 5(5)) ([ASF copy of OUG 99/2006](https://www.asfromania.ro/uploads/articole/attachments/60379a324ef57240266417.pdf), **[Unverified: may not be current consolidated text]**) | Banks only (min. EUR 5 million initial capital, [CRD Art. 12](https://www.legislation.gov.uk/eudr/2013/36/article/12)) |
| Payment services (holding funds in a payment account, money remittance, transfers) | PSD2, Directive 2015/2366 ([EUR-Lex](https://eur-lex.europa.eu/eli/dir/2015/2366/oj)) | Law 209/2019: only payment service providers may offer payment services (Art. 8); payment accounts at a payment institution are "exclusively" for executing payment transactions (Art. 20(1)); payment institutions may not take deposits (Art. 21) ([Law 209/2019](https://legislatie.just.ro/Public/DetaliiDocument/219736)) | Banks, payment institutions (PIs), e-money institutions |
| E-money (stored value issued against funds received) | EMD2, Directive 2009/110/EC ([EUR-Lex](https://eur-lex.europa.eu/eli/dir/2009/110/oj)); funds received are not deposits ([Art. 6(3)](https://www.legislation.gov.uk/eudr/2009/110/article/6)); no interest or time-based benefit ([Art. 12](https://www.legislation.gov.uk/eudr/2009/110/article/12)) | Law 210/2019 ([text](https://legislatie.just.ro/Public/DetaliiDocumentAfis/219752)) | Banks, e-money institutions (EMIs) |

**What this means for Kip.** A pot where money comes in, waits for months and goes back to the same student, with no payment to anyone else, is not really "executing payment transactions". A PI cannot run it as a pure savings pot (Law 209/2019 Art. 20(1), 21). An EMI could hold an e-money balance but cannot pay interest or any benefit for holding it ([EMD2 Art. 12](https://www.legislation.gov.uk/eudr/2009/110/article/12)). The cleanest home for "locked savings" is a **bank deposit in the student's name**. Whether Kip's design is deposit-taking, a payment service or e-money is exactly the question BNR has power to decide. **[Lawyer to confirm]**

Accounting does not change the analysis: Law 209/2019 Art. 8 bans unlicensed provision of payment services regardless of how the funds are booked ([Law 209/2019](https://legislatie.just.ro/Public/DetaliiDocument/219736)).

### 1.2 Licences and registrations available

| Status | What it allows | Initial capital | Safeguarding / insurance | Realistic for Kip? |
|---|---|---|---|---|
| Bank (credit institution) | Deposits, interest | EUR 5 million minimum ([CRD Art. 12](https://www.legislation.gov.uk/eudr/2013/36/article/12)) | Deposit guarantee scheme | No |
| Payment institution | Payment accounts, transfers, card acquiring etc. | EUR 125,000 (services a to e), EUR 20,000 (money remittance only), EUR 50,000 (payment initiation only) ([Law 209/2019 Art. 18(1)](https://legislatie.just.ro/Public/DetaliiDocument/219736)) | Client funds in a separate account at a credit institution, at BNR, or in safe low-risk assets, or covered by insurance/guarantee; protected from other creditors (Art. 38). PSD2 requires segregation by the end of the business day after receipt ([PSD2 Art. 10](https://www.legislation.gov.uk/eudr/2015/2366/article/10)) | Not now |
| Payment initiation provider (PISP) | Start a transfer from the user's bank account | EUR 50,000 (Art. 18(1)) plus professional indemnity insurance (Art. 19(2)) | Never holds funds | Later, if ever |
| Account information provider (AISP) | Read balances/transactions with consent | No initial capital ([PSD2 Art. 33](https://www.legislation.gov.uk/eudr/2015/2366/article/33)); registration with BNR before starting; professional indemnity insurance required (Law 209/2019 Art. 96 to 97) | Not applicable | Possible in year 2 |
| E-money institution | Issue e-money, wallets | EUR 350,000 (Law 210/2019 Art. 17) | Separate account or high-quality assets, within max. 5 business days of issuance (Art. 34 to 35) ([Law 210/2019](https://legislatie.just.ro/Public/DetaliiDocumentAfis/219752)) | No |
| Small PI waiver | PSD2 lets states exempt PIs under EUR 3 million monthly average volume ([PSD2 Art. 32](https://www.legislation.gov.uk/eudr/2015/2366/article/32)) | | | We found no such regime in Law 209/2019. **[Lawyer to confirm]** |
| Small EMI waiver | EMD2 lets states exempt EMIs under EUR 5 million average outstanding e-money ([EMD2 Art. 9](https://www.legislation.gov.uk/eudr/2009/110/article/9)) | | | We found no such regime in Law 210/2019. **[Lawyer to confirm]** |
| Agent of a licensed PI | Provide the PI's payment services in its name | None for the agent; the PI notifies BNR (or its home regulator) with agent details and controls (Law 209/2019 Art. 63) | Principal's safeguarding applies | Yes, with a willing partner |
| Distributor of e-money | Distribute and redeem a licensed EMI's e-money | None; EMIs may use distributors (Law 210/2019 Art. 46(2), Art. 61 for passported EMIs) but may never outsource issuance (Art. 46(1)) | EMI's safeguarding applies | Yes, with a willing partner |
| Customer of a licensed AISP | Receive account data the licensed AISP collected | None if the licensed provider delivers the AIS; the EBA says an AISP may pass consolidated data to a third party with the user's explicit agreement ([EBA Q&A 2018_4098](https://www.eba.europa.eu/single-rule-book-qa/qna/view/publicId/2018_4098)) | GDPR applies | Yes. **[Lawyer to confirm the exact structure]** |

### 1.3 How long BNR authorisation takes

- **By law:** BNR must decide within 3 months of a complete application (Law 209/2019 Art. 26(1); Law 210/2019 Art. 25(1)), and the clock can pause while BNR asks questions (Art. 26(3) to (5)) ([Law 209/2019](https://legislatie.just.ro/Public/DetaliiDocument/219736), [Law 210/2019](https://legislatie.just.ro/Public/DetaliiDocumentAfis/219752)).
- **In practice (EU-wide):** the EBA's 2023 peer review found authorisation took 4 to 20+ months, with most authorities at 7 to 9 months ([EBA peer review](https://www.eba.europa.eu/eba-publishes-peer-review-authorisation-under-payment-services-directive)). The December 2025 follow-up reports a median of 9.5 months excluding one outlier ([EBA follow-up report](https://www.eba.europa.eu/sites/default/files/2025-12/31b327d1-09ef-4ede-a5ec-40ea833fca4d/Follow-up%20peer%20review%20report%20on%20authorisations%20under%20PSD2.pdf)). We did not find a Romania-specific figure. **[Unverified for Romania]** Plan for 9 to 12+ months including preparing the file.

### 1.4 Why "marketplace + refunds" does not work

1. **The commercial agent exclusion needs a sale between two other parties.** PSD2 Art. 3(b) and Law 209/2019 Art. 4(1)(b) exclude payments through an agent authorised to negotiate or conclude the sale or purchase of goods or services on behalf of **only the payer or only the payee** ([Law 209/2019](https://legislatie.just.ro/Public/DetaliiDocument/219736)). Recital 11 adds that platforms acting for both sides are excluded only if they never possess or control client funds ([summary of Art. 3(b) and Recital 11](https://www.ebf.eu/wp-content/uploads/2020/01/EBF-PSD2-Guidance-Final-v.120.pdf)). The EBA/Commission answer is that an e-commerce platform receiving payment for a payee "is not to be excluded by default", and settling the buyer's debt is not in itself a reason for exclusion ([EBA Q&A 2020_5354](https://www.eba.europa.eu/single-rule-book-qa/qna/view/publicId/2020_5354)). Kip sells nothing, the student is both payer and payee, and Kip would hold the funds, so the exclusion does not fit at all.
2. **It is getting stricter.** The agreed PSR keeps the exclusion but adds that the payer or payee must have real room to negotiate, and defines "commercial agent" by reference to Directive 86/653 ([Simmons & Simmons](https://www.simmons-simmons.com/en/publications/cmanzeyn1009cvch0q9u61uva/relevant-exclusions-under-the-psd3-psr)). The EBA is expected to issue guidelines on it ([Addleshaw Goddard](https://www.addleshawgoddard.com/globalassets/insights/financial-regulation/in-the-know-payments-PSD2-exclusions.pdf)).
3. **Refunds are not a withdrawal rail.** Stripe refunds go only to the original payment method, the total can't exceed the original charge, and Stripe's processing fee is not returned ([Stripe refunds](https://docs.stripe.com/refunds)). So a student who saved with 10 card payments would get 10 separate card refunds, never a single bank payout, and never the parent's match. Holding the money between payment and "refund" is still holding client funds.
4. **Stripe's own rules.** Stripe lists escrow services, stored value issued by anyone other than the seller, money transmitters and "other financial services" as restricted, and peer-to-peer money transmission as prohibited ([Stripe restricted businesses](https://stripe.com/legal/restricted-businesses)). Stripe also states it "doesn't provide escrow services" ([manual payouts](https://docs.stripe.com/connect/manual-payouts)).

### 1.5 What Stripe actually allows (the "7 day max")

| Mechanism | Real limit | Source |
|---|---|---|
| Card authorisation hold (charge later) | Online card payments: about 7 days (Visa merchant-initiated: about 5 days); some extended authorisations possible | [Place a hold](https://docs.stripe.com/payments/place-a-hold-on-a-payment-method) |
| Payout timing, Romania | First payout: 7 calendar days; then 3 business days by default; minimum payout 5 RON | [Stripe payouts](https://docs.stripe.com/payouts) |
| Connect, manual payouts on a connected account | Must pay out within **90 days** ("All other countries"; US 2 years, Thailand 10 days) | [Manual payouts](https://docs.stripe.com/connect/manual-payouts) |
| Platform's own balance | No published maximum found, but it is Kip's own balance: customer money there means Kip is holding client funds | [Stripe payouts](https://docs.stripe.com/payouts) |
| Separate charges and transfers | Supported for RO; cross-border within EEA allowed; platform pays refunds, disputes and negative balances; "funds segregation" is private preview | [Separate charges and transfers](https://docs.stripe.com/connect/separate-charges-and-transfers) |
| Treasury / Financial Accounts | US and UK public preview, Australia private preview; Romania not listed | [Stripe Treasury](https://docs.stripe.com/treasury) |
| Eurozone platform financial accounts | On Stripe's roadmap as private/public preview in 2026; Romania is not in the eurozone | [Sessions 2026](https://stripe.com/blog/everything-we-announced-at-sessions-2026) |

### 1.6 PSD3 / PSR: what applies now

- Provisional political agreement: 27 November 2025 ([HLC](https://www.hlc.com/en/publications/final-texts-for-psd3-and-psr-awaited-as-european-parliament-and-council-of-eu-announce-provisional)). Final compromise texts published by the Council: 23 April 2026 ([Matheson](https://www.matheson.com/insights/psd3-and-psr-published-whats-changing-for-eu-payment-services/)). Parliament's ECON committee approved: 5 May 2026; indicative plenary date 14 December 2026 ([Clearing Post](https://clearingpost.com/insights/legislative-observatory-lists-december-14-indicative-plenary-date-for-psd3-and-p/)). Council first-reading position dated 21 October 2026, published 23 October 2026 ([Regulation Tomorrow](https://www.regulationtomorrow.com/2026/10/psd3-council-of-eu-publishes-first-reading-position-with-view-to-adoption/)).
- **Not yet in the Official Journal.** PSR applies 18 months (some sources say 21) after entry into force, so in practice around 2028 ([Clearing Post](https://clearingpost.com/insights/legislative-observatory-lists-december-14-indicative-plenary-date-for-psd3-and-p/)). Today, PSD2/Law 209/2019 and EMD2/Law 210/2019 apply.
- Direction of travel: e-money institutions become a sub-category of payment institutions ([EPRS briefing](https://www.europarl.europa.eu/RegData/etudes/BRIE/2025/775891/EPRS_BRI(2025)775891_EN.pdf)); safeguarding at central banks allowed and concentration risk addressed ([Safeheld](https://safeheld.com/resources/psd3-psr-safeguarding)); capital figures in commentary differ, so final amounts are **[Unverified]**.

### 1.7 Sandbox or innovation hub a student team can use

- **BNR FinTech Innovation Hub** (since September 2019): a dialogue and guidance channel for payment and financial innovation, applied for with a standard form; registering does not mean BNR approves the project ([BNR hub](https://bnr.ro/apage.aspx?pid=20332), [launch coverage](https://www.finextra.com/pressarticle/79992/national-bank-of-romania-launches-fintech-innovation-hub)). It is guidance, not a sandbox. We could not confirm the current form URL. **[Unverified]**
- **BNR and RoFintech** signed a 4-year cooperation protocol on 12 October 2026 covering open banking, access to payment services and practical implementation of rules ([Revista Biz](https://www.revistabiz.ro/bnr-si-rofintech-incheie-un-protocol-pentru-sustinerea-inovatiei-fintech-in-romania/)). Joining or contacting RoFintech is a low-cost route to BNR.
- **ASF** has an InsurTech hub and has talked about a sandbox; we could not confirm a live sandbox, and ASF does not supervise payments anyway ([Profit.ro](https://profit.ro/povesti-cu-profit/financiar/asf-vrea-sa-dezvolte-un-sandbox-in-care-firmele-sa-testeze-serviciile-produsele-financiare-19000174)).
- EU list of innovation facilitators: [ESAs Joint Committee](https://esas-joint-committee.europa.eu/efif/innovation-facilitators-in-the-eu).

---

## 2. Workable models that avoid holding money

### a) Tracker + nudge (current prototype)

Money stays in the student's own bank or Revolut savings; Kip records goals, plans deposits, nudges and shows progress. The parent's match is paid by the parent directly to the student (bank transfer or RoPay, free for individuals per [RoPay FAQ](https://www.ropay.ro/en/faq/)); Kip only records the pledge.

- **Legal:** Kip never receives funds, so no licence. Kip can still charge its own subscription through Stripe (that is Kip's own revenue).
- **Pros:** zero licensing, zero per-deposit fees, works with every bank. **Cons:** progress is self-reported until bank data is connected; the student can move money out freely.
- **Who does it:** banks' own goal tools (BCR George goals, below); many budgeting apps.
- **Hackathon:** yes, now. **Launch:** yes, as stage 1.

### b) Open banking (AIS to read, PIS to move)

- **AIS (read balances):** lets Kip verify the savings balance automatically. Own AISP registration needs no capital but needs BNR registration and insurance (section 1.2). Without a licence, Kip can be a customer of a licensed provider that delivers the AIS and passes data with the user's consent ([EBA Q&A 2018_4098](https://www.eba.europa.eu/single-rule-book-qa/qna/view/publicId/2018_4098)). **[Lawyer to confirm]**
- **PIS (start a transfer):** e.g. a "Save 20 lei now" button moving money from the student's current account to their own savings account. A PISP never holds funds but needs EUR 50,000 capital if Kip does it itself; using a licensed PISP avoids that. Each payment needs the user's bank authentication.

| Provider | Romanian coverage | Licence model for unlicensed customers | Price |
|---|---|---|---|
| Smart Fintech (Romania) | BNR-authorised PI for payment initiation; SmartPay launched with BRD, BCR, BT, ING, CEC, Raiffeisen; also an AIS product (Smart Accounts) ([Smart Fintech](https://www.smartfintech.eu/post/en-smart-fintech-obtains-bnr-authorization-and-becomes-the-first-third-party-payment-provider-tpp), [Wall-Street.ro](https://www.wall-street.ro/articol/Finante-Banci/271621/smart-pay-prima-solutie-psd2-de-initiere-plati-ce-primeste-stampila-bnr.html)) | Merchant-focused; whether it supports payments to the user's own account is **[Unverified]** | Pay-per-use, not published |
| Finqware (Romania) | Used by BT, CEC; payment initiation for 15 Romanian banks ([Finqware guide](https://finqware.com/blog/api-bank-connection-guide-for-romanian-banks/), [Open Banking Expo](https://www.openbankingexpo.com/news/romanias-finqware-launches-finqpayments/)) | B2B platform; **[Unverified]** for consumer apps | Not published |
| Salt Edge | Romanian SME platform Finlayer connects to nearly every Romanian bank via Salt Edge ([Salt Edge blog](https://blog.saltedge.com/finlayer-and-salt-edge-to-bring-open-banking-to-romania/)) | "Partner Program": use Salt Edge's licence, no own PSD2 licence ([Salt Edge](https://www.saltedge.com/partner_program)) | Not published |
| Yapily | Romania coverage **[Unverified]** | "Yapily Connect": AIS/PIS under Yapily's licence; end users contract with Yapily ([Yapily Connect](https://www.yapily.com/yapilyconnect)) | Not published |
| Tink | Romania coverage **[Unverified]** | Licensed AIS/PIS | Sales-led; third-party sites cite about EUR 0.50 per user per month **[Unverified]** ([Merchant Machine](https://merchantmachine.co.uk/open-banking-payments/tink)) |
| GoCardless Bank Account Data (ex-Nordigen) | | New sign-ups reported closed **[Unverified]** ([dev.to](https://dev.to/johnfrandsen/gocardless-bank-account-data-alternatives-what-to-use-when-signups-are-disabled-326d)) | |
| Enable Banking | Lists BCR, BT, BRD, ING, UniCredit, Raiffeisen, OTP; Raiffeisen has a sandbox; RON instant payments supported ([Enable Banking RO](https://enablebanking.com/docs/markets/ro/)) | Licence terms for customers **[Unverified]** | |

- **Hackathon:** use a provider sandbox or mocked data and say so. **Launch:** AIS via a partner is the realistic stage 2.

### c) Licensed EMI or bank via BaaS

Money sits in a segregated account or e-money wallet in the student's name at the partner; Kip is agent/distributor or a tech layer. The partner does KYC (ID, address, selfie) for each student.

| Partner | Fit for Kip | Notes |
|---|---|---|
| Mangopay | Best RON fit found | RON supported for wallets/payouts/FX "on request", depends on contract ([Mangopay currencies](https://docs.mangopay.com/guides/currencies), [July 2026 release notes](https://docs.mangopay.com/release-notes/api/2026-07-07)) |
| Swan | Weak | B2B embedded banking, revenue-share pricing ([Swan pricing](https://swan.io/pricing)); EUR IBANs only per third parties **[Unverified]** |
| Lemonway | Possible, EUR-centric | Custom pricing ([Lemonway](https://lemonway.com/en/pricing-marketplace)); KYC per-user fees of about EUR 0.40/month cited by third parties **[Unverified]** |
| Treezor, Railsr, Unlimit | Not researched in depth | RON support and Romania passport **[Unverified]** |

Problems: most BaaS is EUR-first, e-money can't pay interest ([EMD2 Art. 12](https://www.legislation.gov.uk/eudr/2009/110/article/12)), contracts are sales-led with minimums. A **Romanian bank partnership** (deposit in the student's name, interest allowed) fits savings better than e-money. **Hackathon:** no. **Launch:** stage 3 at the earliest.

**Stripe Connect variant** (each student a connected account, manual payouts): funds may sit at most 90 days ([manual payouts](https://docs.stripe.com/connect/manual-payouts)); each student needs Stripe KYC; Connect is built for paying sellers and service providers, and P2P money transmission is prohibited ([restricted list](https://stripe.com/legal/restricted-businesses)); costs 10 lei per active account per month plus 0.25% + 1.50 lei per payout ([Connect pricing RO](https://stripe.com/en-ro/connect/pricing)). Not a fit for savings.

### d) Link to existing bank round-ups and savings

| Product | What it does | Source |
|---|---|---|
| BT Pay Round Up | Rounds card payments to a chosen threshold into an interest-bearing savings account, withdraw anytime; about 500,000 users reported | [Revista Biz](https://www.revistabiz.ro/500-000-de-persoane-economisesc-prin-round-up-de-la-bt-pay/), [StartupCafe](https://startupcafe.ro/banca-transilvania-clienti-bt-pay-roundup-dobanda-htm-26723) |
| BCR George Round Up + goals | Round to next multiple of 5 lei, optional "Accelerator"; financial goals in George; over 60% of users set goals after launch (bank-reported) | [Revista Biz](https://www.revistabiz.ro/george-de-la-bcr-primeste-doua-noi-functionalitati-round-up-si-spotlights/) |
| ING Round Up | Rounds to next multiple of 5 lei into savings, x2/x5/x10 multipliers, free (2020 terms, may have changed) | [iDevice](https://www.idevice.ro/en/2020/05/18/ing-bank-economisire-417545/) |
| Revolut Instant Access Savings (RON) | 2.5% to 4.25% variable, round-ups as a top-up method, Romanian tax residents | [Revolut RO](https://revolut.com/en-RO/instant-access-savings) |
| Any bank term deposit | A real "lock" with a penalty or loss of interest on early break | Standard bank product |

Kip can't plug into these programmatically today (no public APIs found), but it can deep-link the student to set them up and then verify balances via AIS. **Hackathon:** yes ("Kip tells you to switch on BT Round Up, then tracks it"). **Launch:** yes.

### Summary

| Model | Holds money? | Licence needed | Per-deposit cost | Hackathon now | Real launch |
|---|---|---|---|---|---|
| a) Tracker + nudge | No | None | 0 | Yes | Stage 1 |
| b) AIS via partner | No | None if partner provides AIS **[Lawyer to confirm]** | Per-user fee (quote) | Mock/sandbox | Stage 2 |
| b) PIS via partner | No | None if partner is PISP | Per-payment fee (quote) | Mock/sandbox | Stage 2 to 3 |
| c) EMI/bank partner | Partner does | Agent/distributor | Partner pricing | No | Stage 3 |
| c) Stripe Connect | Stripe/Kip, max 90 days | Problematic | Card fee + Connect fees | Test mode only, labelled | No |
| d) Bank round-ups | Bank does | None | 0 | Yes | Yes |

---

## 3. Fees

### 3.1 Stripe pricing for a Romanian account (standard pricing)

| Item | Fee | Source |
|---|---|---|
| Standard EEA cards | 1.5% + 1.00 leu | [Stripe RO pricing](https://stripe.com/en-ro/pricing) |
| Premium EEA cards | 2.8% + 1.00 leu | same |
| UK cards | 2.5% + 1.00 leu | same |
| International cards | 3.15% + 1.00 leu, +2% if conversion | same |
| Revolut Pay | 1.5% + 1.00 leu | [Local payment methods RO](https://stripe.com/en-ro/pricing/local-payment-methods) |
| SEPA Direct Debit | 1.80 lei per charge; **EUR only**, settles T+6 | same; [SEPA DD docs](https://docs.stripe.com/payments/sepa-debit) |
| SEPA bank transfer | 0.5%, capped at 25 lei (EUR) | [Local payment methods RO](https://stripe.com/en-ro/pricing/local-payment-methods) |
| Pay by Bank | 0.5% + 1.00 leu, but payers only from UK, Finland, Ireland (BE/FR/DE preview), EUR/GBP: **not usable by Romanian bank customers** | same; [Pay by Bank docs](https://docs.stripe.com/payments/pay-by-bank) |
| Billing | 0.7% of billing volume (pay as you go) | [Billing pricing RO](https://stripe.com/en-ro/billing/pricing) |
| Invoicing | 0.4% per paid invoice (Starter) | [Stripe RO pricing](https://stripe.com/en-ro/pricing) |
| Connect (you handle pricing) | 10 lei per active account/month; payouts 0.25% + 1.50 lei | [Connect pricing RO](https://stripe.com/en-ro/connect/pricing) |
| Instant payouts | 1%, min 2.00 lei | [Stripe RO pricing](https://stripe.com/en-ro/pricing) |
| Refunds | No refund fee for cards; original fee not returned | [Stripe RO pricing](https://stripe.com/en-ro/pricing), [refunds](https://docs.stripe.com/refunds) |
| Minimum charge | 2.00 RON | [Currencies](https://docs.stripe.com/currencies) |

The "about 1.5 lei" the team saw matches the card fee on a 20 to 50 lei deposit (1.30 to 1.75 lei) or the Connect payout fee (0.25% + 1.50 lei). On a 5-lei deposit the card fee is 1.075 lei, which is 21.5% of the deposit.

### 3.2 Ways to cut the fixed fee

| Option | How | Trade-offs |
|---|---|---|
| Batching | One weekly or monthly charge for all planned deposits | Fewer, bigger charges; less instant gratification; still means Kip holds money unless the charge is Kip's own fee |
| Commit now, collect once | Student pledges amounts in the app; one charge or one transfer at month end | Same as batching; pledges can be broken |
| SEPA Direct Debit | 1.80 lei per debit | EUR only, so RON accounts can't use it; 8-week no-questions refund right for payers ([SEPA DD docs](https://docs.stripe.com/payments/sepa-debit)) |
| Open banking payment (PIS) | Licensed PISP moves money from current to savings account | Per-payment fee on quote; bank login each time; good when the payee is the student's own account |
| RoPay | Instant RON account-to-account via banking apps; free for individuals; merchants pay their bank or processor ([RoPay FAQ](https://www.ropay.ro/en/faq/), [RoPay for business](https://www.ropay.ro/en/ropay-for-business/)) | Merchant acceptance needs a bank/processor contract. ING's promo until 1 July 2027: 0% from ING payers, 0.25% from other banks, and requires an ING acceptance service ([Revista Biz](https://www.revistabiz.ro/ing-lanseaza-ropay-pentru-clientii-business/), **[Unverified: secondary source]**). If Kip is the payee, Kip is again receiving client money |
| Bank transfer to one Kip IBAN with reference codes | Students send RON transfers with a code; Kip reconciles | No processor fee, but Kip holds funds (licence problem) and must reconcile manually |
| Transfer into the student's own savings account | Standing order, round-up, or in-app transfer at the student's bank | Usually free; Kip needs AIS or self-reporting to see it; this is the recommended path |

### 3.3 Worked example: 10 deposits of 20 lei per month (200 lei)

| Option | Calculation | Fees/month | % of 200 lei | Legal fit |
|---|---|---|---|---|
| Card each deposit, standard EEA | 10 x (0.30 + 1.00) | 13.00 lei | 6.5% | Kip holds funds: no |
| Card each deposit, premium EEA | 10 x (0.56 + 1.00) | 15.60 lei | 7.8% | no |
| Card each deposit via Stripe Billing | 13.00 + 0.7% x 200 | 14.40 lei | 7.2% | no |
| Weekly batch, 4 x 50 lei card | 4 x (0.75 + 1.00) | 7.00 lei | 3.5% | no |
| Monthly batch, 1 x 200 lei card | 3.00 + 1.00 | 4.00 lei | 2.0% | no (fine for Kip's own fee) |
| Monthly batch with Billing | 4.00 + 1.40 | 5.40 lei | 2.7% | as above |
| Revolut Pay via Stripe | same as card rows | 13.00 / 4.00 lei | 6.5% / 2.0% | no |
| SEPA Direct Debit | 10 x 1.80 (or 1 x 1.80) | 18.00 (1.80) lei + FX | 9.0% (0.9%) | EUR only: not practical |
| Stripe Pay by Bank | not available to Romanian payers | n/a | n/a | n/a |
| Add-on: Connect payout of 200 lei that month | 10 + (0.50 + 1.50) | +12.00 lei | +6.0% | no |
| RoPay to Kip (ING promo, other-bank payer) | 0.25% x 200 | 0.50 lei (0 same bank) | 0.25% | Kip holds funds: no |
| Bank transfer to Kip IBAN | processor fee 0; bank tariffs vary | about 0 | about 0 | Kip holds funds: no |
| PIS via licensed partner, to own savings | 10 x p (price on quote) | e.g. 5.00 lei if p = 0.50 lei (**illustrative only**) | 2.5% | yes |
| Student's own transfer/round-up to own savings | free at most banks | 0 lei | 0% | yes |

---

## 4. What the studies say

| Study | Finding | Implication for Kip |
|---|---|---|
| Ashraf, Karlan & Yin (2006), SEED, Philippines | 28.4% (202 of 710) took up a commitment account; savings balances rose 81 percentage points after 12 months in the treatment group vs control ([Yale ISPS](https://isps.yale.edu/research/publications/isps06-009), [MF Gateway](https://microfinancegateway.org/paper/2005/09/tying-odysseus-mast-evidence-commitment-savings-product-philippines)) | Commitment works for the roughly 1 in 4 who want it; make a lock optional, not the default |
| Beshears et al. (2020) | When interest is equal, the fully illiquid commitment account attracted more money than ones with 10% or 20% early-withdrawal penalties ([Harvard DASH](https://dash.harvard.edu/entities/publication/6a36d4bb-d432-47c1-867d-112b3c0ed6f8)) | Some users actively want a hard lock; route them to a bank term deposit rather than Kip holding money |
| John (2020), "When Commitment Fails" | 55% of regular-saver clients defaulted and paid the penalty; more naive people chose commitment ([World Bank blog](https://blogs.worldbank.org/en/impactevaluations/when-commitment-fails-guest-post-anett-hofmann), [paper](https://www.poverty-action.org/sites/default/files/publications/When_Commitment_Fails.pdf)) | Avoid penalties; use soft commitments with a graceful "reset" |
| Dupas & Robinson (2013), Kenya | A safe box and a labelled "health pot" raised health investment; a lockbox (no key) did not help more and held about half the balance of a safe box ([J-PAL](https://www.povertyactionlab.org/print/pdf/node/1656), [Wilson Quarterly](https://www.wilsonquarterly.com/quarterly/fall-2014-mexican-momentum/are-lockboxes-key-prosperity-in-developing-world)) | A safe, labelled place beats a lock: a named savings account at the student's bank is enough |
| Soman & Cheema (2011) | Earmarking (children's photos on envelopes) and partitioning into two envelopes increased savings among low-income workers ([paper](https://www.russellsage.org/sites/default/files/u137/jmr-C-s014-s021-online.pdf)) | Goal photo and name; split goals into weekly "envelopes" |
| Soman & Zhao (2011) | One goal led to more saving than several, especially when saving was hard ([World Bank blog](https://blogs.worldbank.org/en/impactevaluations/marketing-saving-fewer-goals-can-lead-to-higher-savings)) | Limit active goals to one (max two) |
| Gargano & Rossi (2024), J. Finance | Goal setting in a fintech savings app raised savings rates without reducing outside saving, most for low savers ([RePEc](https://econpapers.repec.org/RePEc:bla:jfinan:v:79:y:2024:i:3:p:1931-1976)) | Kip's core feature (goals + tracking) is evidence-backed without holding money |
| Madrian & Shea (2001) | Auto-enrolment raised 401(k) participation of new hires, often cited as 37% to 86% ([NBER](https://www.nber.org/papers/w7682); figures via [Springer review](https://link.springer.com/article/10.1007/s10797-019-09565-6), **[secondary]**) | Default a weekly amount and help set a bank standing order |
| Thaler & Benartzi (2004), Save More Tomorrow | Participants went from 3.5% to 13.6% savings rates ([Thaler testimony](https://www.jec.senate.gov/archive/Documents/Hearings/thalertestimony10march2004.pdf)); US DOL rates causal evidence as low ([CLEAR](https://clear.dol.gov/study/save-more-tomorrow%E2%84%A2-using-behavioral-economics-increase-employee-saving-thaler-benartzi-2004)) | Offer "save a bit more next month" or tie increases to scholarship/bursă or job pay dates |
| Karlan et al. (2016), reminders | Reminders raised savings (Philippines +6.3%, goal attainment +3.1%); messages naming the goal and incentives worked best; a Bolivia variant raised balances 10% ([NBER](https://www.nber.org/papers/w16205), [J-PAL Bolivia](https://www.povertyactionlab.org/evaluation/text-message-reminders-and-incentives-save-bolivia)) | Goal-specific nudges, not generic ones |
| Duflo, Gale, Liebman, Orszag & Saez (2006), H&R Block | Participation 3% (no match), 8% (20% match), 14% (50% match) ([NBER](https://www.nber.org/papers/w11680.pdf)) | A parent match lifts take-up, but most people still don't join: pair it with defaults |
| IDAs (Tulsa experiment) | Early homeownership gains vanished after 10 years; no significant net-worth effect ([Brookings slides](https://www.brookings.edu/wp-content/uploads/2012/04/0426_ida_presentation_gale.pdf)) | Matches are a hook, not a long-term guarantee |
| Round-ups (Putz 2022, working paper) | Enrolment in a bank round-up program came with about USD 300/month more spending vs about USD 4.50/week saved ([AEA 2023](https://aeaweb.org/conference/2023/program/paper/D8QD5Z29)); an RCT with a German app is registered ([AEA registry](https://www.socialscienceregistry.org/trials/10512)) | Treat round-ups as a bonus, not the main engine |
| Romania / EU context | EU: 18% high financial literacy; Romania has one of the highest shares with low financial knowledge (30%) ([Flash Eurobarometer 525](https://europa.eu/eurobarometer/surveys/detail/2953), figures via report summary **[secondary]**); OECD/INFE 2023 covers 39 countries ([OECD](https://www.oecd.org/en/publications/oecd-infe-2023-international-survey-of-adult-financial-literacy_56003a32-en.html)), no Romania youth figure found | Simple language, small steps, education inside the app |

**Bottom line:** the evidence does not require Kip to lock money away. A labelled goal, one goal at a time, a default weekly amount, goal-specific reminders and a parent match cover most of the measured effect. Hard locks help a minority and can harm over-confident users; for them, Kip can recommend a bank term deposit.

---

## 5. Recommendation

### 5.1 What to tell the jury now

- "Kip never touches the students' money. Savings stay in the student's own bank account; Kip is the coach: goals, plan, reminders, parent match and progress."
- "We first designed Kip to hold the money. We checked: in the EU that is deposit-taking or e-money, which needs a BNR licence and EUR 125,000 to 350,000 in capital. So we changed the design."
- "Stripe in our demo runs in test mode. In production Stripe charges only Kip's own optional subscription, once a month. The deposit flow you see is a simulation of what a licensed partner (bank or open-banking provider) will do."
- "Next step is read-only open banking through a licensed provider so progress is verified automatically, and a conversation with the BNR FinTech Innovation Hub."

### 5.2 Staged path

| Stage | When | What | Legal posture | Rough cost (estimates, not quotes) |
|---|---|---|---|---|
| 0. Hackathon | Now | Tracker + nudge; ledger is a mirror of the student's own savings; Stripe test mode only; parent match as a pledge paid parent to student | No regulated activity | 0 |
| 1. Pilot | 0 to 3 months | Self-reported deposits, deep links to bank apps and round-ups, reminders, one goal at a time; Kip subscription via one monthly Stripe charge (1.5% + 1 leu); submit BNR Innovation Hub form; written legal opinion | No licence | Legal opinion: a few thousand EUR **[estimate]** |
| 2. Verified tracking | 3 to 9 months | AIS through a licensed aggregator (Salt Edge partner, Finqware, Enable Banking, Tink); optional PIS "save now" to own savings via Smart Fintech/Finqware; GDPR DPIA | Partner's licence; lawyer confirms Kip needs no registration | Per-user/per-call fees on quote |
| 3. Kip-branded pots | 9 to 24 months | Bank partnership (deposit in the student's name) or EMI with RON support (Mangopay on request) with Kip as agent/distributor; partner KYC | Agent/distributor of a licensed firm | Partner minimums and revenue share on quote |
| 4. Own licence (optional) | 2028+ under PSD3 | Own AISP registration (insurance only) or PI/EMI | BNR authorisation, 9 to 12+ months | PI: EUR 125,000 capital; EMI: EUR 350,000; plus compliance staff, audit, IT **[estimate: several hundred thousand EUR in year one]** |

### 5.3 Questions for a lawyer

1. Would BNR treat Kip's original "hold until goal" design as deposit-taking (OUG 99/2006 Art. 5) or e-money?
2. Confirm Romania has no small PI (PSD2 Art. 32) or small EMI (EMD2 Art. 9) waiver.
3. Can Kip receive account data from a licensed AISP without its own registration (EBA Q&A 2018_4098)?
4. Is a Kip-funded reward or a parent's match routed through Kip a payment service (money remittance)?
5. Tax and consumer-law treatment of a Kip subscription sold to 18+ students.

---

## Sources

**EU and Romanian law**
- PSD2, Directive (EU) 2015/2366: https://eur-lex.europa.eu/eli/dir/2015/2366/oj ; Art. 3, 10, 32, 33: https://www.legislation.gov.uk/eudr/2015/2366/contents
- EMD2, Directive 2009/110/EC: https://eur-lex.europa.eu/eli/dir/2009/110/oj ; Art. 6: https://www.legislation.gov.uk/eudr/2009/110/article/6 ; Art. 9: https://www.legislation.gov.uk/eudr/2009/110/article/9 ; Art. 12: https://www.legislation.gov.uk/eudr/2009/110/article/12
- CRD, Directive 2013/36/EU, Art. 9: https://www.legislation.gov.uk/eudr/2013/36/article/9 ; Art. 12: https://www.legislation.gov.uk/eudr/2013/36/article/12
- Law 209/2019: https://legislatie.just.ro/Public/DetaliiDocument/219736
- Law 210/2019: https://legislatie.just.ro/Public/DetaliiDocumentAfis/219752
- OUG 99/2006 (ASF copy): https://www.asfromania.ro/uploads/articole/attachments/60379a324ef57240266417.pdf
- EBA Q&A 2020_5354: https://www.eba.europa.eu/single-rule-book-qa/qna/view/publicId/2020_5354
- EBA Q&A 2018_4098: https://www.eba.europa.eu/single-rule-book-qa/qna/view/publicId/2018_4098
- EBF PSD2 guidance (Art. 3(b), Recital 11): https://www.ebf.eu/wp-content/uploads/2020/01/EBF-PSD2-Guidance-Final-v.120.pdf
- EBA peer review on authorisation: https://www.eba.europa.eu/eba-publishes-peer-review-authorisation-under-payment-services-directive
- EBA follow-up peer review (Dec 2025): https://www.eba.europa.eu/sites/default/files/2025-12/31b327d1-09ef-4ede-a5ec-40ea833fca4d/Follow-up%20peer%20review%20report%20on%20authorisations%20under%20PSD2.pdf
- Simmons & Simmons, PSD3/PSR exclusions: https://www.simmons-simmons.com/en/publications/cmanzeyn1009cvch0q9u61uva/relevant-exclusions-under-the-psd3-psr
- Addleshaw Goddard, PSD2 exclusions: https://www.addleshawgoddard.com/globalassets/insights/financial-regulation/in-the-know-payments-PSD2-exclusions.pdf
- PSD3/PSR status: https://www.regulationtomorrow.com/2026/10/psd3-council-of-eu-publishes-first-reading-position-with-view-to-adoption/ ; https://clearingpost.com/insights/legislative-observatory-lists-december-14-indicative-plenary-date-for-psd3-and-p/ ; https://www.matheson.com/insights/psd3-and-psr-published-whats-changing-for-eu-payment-services/ ; https://www.hlc.com/en/publications/final-texts-for-psd3-and-psr-awaited-as-european-parliament-and-council-of-eu-announce-provisional ; https://www.europarl.europa.eu/RegData/etudes/BRIE/2025/775891/EPRS_BRI(2025)775891_EN.pdf ; https://safeheld.com/resources/psd3-psr-safeguarding
- BNR FinTech Innovation Hub: https://bnr.ro/apage.aspx?pid=20332 ; https://www.finextra.com/pressarticle/79992/national-bank-of-romania-launches-fintech-innovation-hub
- BNR and RoFintech protocol: https://www.revistabiz.ro/bnr-si-rofintech-incheie-un-protocol-pentru-sustinerea-inovatiei-fintech-in-romania/
- ASF sandbox plans: https://profit.ro/povesti-cu-profit/financiar/asf-vrea-sa-dezvolte-un-sandbox-in-care-firmele-sa-testeze-serviciile-produsele-financiare-19000174
- ESAs innovation facilitators: https://esas-joint-committee.europa.eu/efif/innovation-facilitators-in-the-eu

**Stripe**
- Pricing Romania: https://stripe.com/en-ro/pricing
- Local payment methods Romania: https://stripe.com/en-ro/pricing/local-payment-methods
- Connect pricing Romania: https://stripe.com/en-ro/connect/pricing
- Billing pricing Romania: https://stripe.com/en-ro/billing/pricing
- Manual payouts: https://docs.stripe.com/connect/manual-payouts
- Payouts: https://docs.stripe.com/payouts
- Separate charges and transfers: https://docs.stripe.com/connect/separate-charges-and-transfers
- Refunds: https://docs.stripe.com/refunds
- Authorisation holds: https://docs.stripe.com/payments/place-a-hold-on-a-payment-method
- SEPA Direct Debit: https://docs.stripe.com/payments/sepa-debit
- Pay by Bank: https://docs.stripe.com/payments/pay-by-bank
- Currencies and minimums: https://docs.stripe.com/currencies
- Treasury: https://docs.stripe.com/treasury
- Sessions 2026 announcements: https://stripe.com/blog/everything-we-announced-at-sessions-2026
- Restricted businesses: https://stripe.com/legal/restricted-businesses

**Romanian payments, open banking, BaaS, banks**
- RoPay FAQ: https://www.ropay.ro/en/faq/ ; RoPay for business: https://www.ropay.ro/en/ropay-for-business/
- ING RoPay business pricing: https://www.revistabiz.ro/ing-lanseaza-ropay-pentru-clientii-business/
- Enable Banking Romania: https://enablebanking.com/docs/markets/ro/
- Smart Fintech: https://www.smartfintech.eu/post/en-smart-fintech-obtains-bnr-authorization-and-becomes-the-first-third-party-payment-provider-tpp ; https://www.wall-street.ro/articol/Finante-Banci/271621/smart-pay-prima-solutie-psd2-de-initiere-plati-ce-primeste-stampila-bnr.html
- Finqware: https://finqware.com/blog/api-bank-connection-guide-for-romanian-banks/ ; https://www.openbankingexpo.com/news/romanias-finqware-launches-finqpayments/
- Salt Edge: https://www.saltedge.com/partner_program ; https://blog.saltedge.com/finlayer-and-salt-edge-to-bring-open-banking-to-romania/
- Yapily Connect: https://www.yapily.com/yapilyconnect
- Tink pricing (third party): https://merchantmachine.co.uk/open-banking-payments/tink
- GoCardless sign-ups (third party): https://dev.to/johnfrandsen/gocardless-bank-account-data-alternatives-what-to-use-when-signups-are-disabled-326d
- Mangopay: https://docs.mangopay.com/guides/currencies ; https://docs.mangopay.com/release-notes/api/2026-07-07
- Swan: https://swan.io/pricing ; Lemonway: https://lemonway.com/en/pricing-marketplace
- BT Round Up: https://www.revistabiz.ro/500-000-de-persoane-economisesc-prin-round-up-de-la-bt-pay/ ; https://startupcafe.ro/banca-transilvania-clienti-bt-pay-roundup-dobanda-htm-26723
- BCR George: https://www.revistabiz.ro/george-de-la-bcr-primeste-doua-noi-functionalitati-round-up-si-spotlights/
- ING Round Up: https://www.idevice.ro/en/2020/05/18/ing-bank-economisire-417545/
- Revolut Romania savings: https://revolut.com/en-RO/instant-access-savings

**Behavioural studies**
- Ashraf, Karlan & Yin 2006: https://isps.yale.edu/research/publications/isps06-009 ; https://microfinancegateway.org/paper/2005/09/tying-odysseus-mast-evidence-commitment-savings-product-philippines
- Beshears et al. 2020: https://dash.harvard.edu/entities/publication/6a36d4bb-d432-47c1-867d-112b3c0ed6f8
- John, When Commitment Fails: https://blogs.worldbank.org/en/impactevaluations/when-commitment-fails-guest-post-anett-hofmann ; https://www.poverty-action.org/sites/default/files/publications/When_Commitment_Fails.pdf
- Dupas & Robinson 2013: https://www.povertyactionlab.org/print/pdf/node/1656 ; https://www.wilsonquarterly.com/quarterly/fall-2014-mexican-momentum/are-lockboxes-key-prosperity-in-developing-world
- Soman & Cheema 2011: https://www.russellsage.org/sites/default/files/u137/jmr-C-s014-s021-online.pdf
- Soman & Zhao 2011: https://blogs.worldbank.org/en/impactevaluations/marketing-saving-fewer-goals-can-lead-to-higher-savings
- Gargano & Rossi 2024: https://econpapers.repec.org/RePEc:bla:jfinan:v:79:y:2024:i:3:p:1931-1976
- Madrian & Shea 2001: https://www.nber.org/papers/w7682 ; https://link.springer.com/article/10.1007/s10797-019-09565-6
- Thaler & Benartzi 2004: https://www.jec.senate.gov/archive/Documents/Hearings/thalertestimony10march2004.pdf ; https://clear.dol.gov/study/save-more-tomorrow%E2%84%A2-using-behavioral-economics-increase-employee-saving-thaler-benartzi-2004
- Karlan et al. 2016: https://www.nber.org/papers/w16205 ; https://www.povertyactionlab.org/evaluation/text-message-reminders-and-incentives-save-bolivia
- Duflo et al. 2006: https://www.nber.org/papers/w11680.pdf
- IDAs: https://www.brookings.edu/wp-content/uploads/2012/04/0426_ida_presentation_gale.pdf
- Round-ups: https://aeaweb.org/conference/2023/program/paper/D8QD5Z29 ; https://www.socialscienceregistry.org/trials/10512
- Flash Eurobarometer 525: https://europa.eu/eurobarometer/surveys/detail/2953
- OECD/INFE 2023: https://www.oecd.org/en/publications/oecd-infe-2023-international-survey-of-adult-financial-literacy_56003a32-en.html
