# Kip: target partner institution

Status: 28 October 2026. Research, not legal advice. Builds on `legal-and-payments.md`. **[Unverified]** = no primary source. **[Lawyer]** = needs a Romanian payments lawyer.

## Verdict

- **Primary: Libra Internet Bank S.A.** (BNR-licensed bank).
- **Backup: Raiffeisen Bank S.A.** (Romania).
- Non-bank fallback only if both decline: **Mangopay** (Luxembourg EMI). Not the backup: RON is unclear and e-money pays no interest.

No Romanian institution sells BaaS off the shelf ([Kinstellar](https://kinstellar.com/upload/BaaS%20Romania.pdf), undated), so any bank deal is custom; EU BaaS EMIs are EUR-first.

## Comparison

Banks hold money in the customer's own name, with interest and deposit guarantee. EMIs hold safeguarded e-money in a KYC'd user's name, no interest ([EMD2 Art. 12](https://www.legislation.gov.uk/eudr/2009/110/article/12)).

| Candidate | Licence | RON | Route for an unlicensed startup | Interest / lock | Verdict |
|---|---|---|---|---|---|
| **Libra Internet Bank** | Bank, BNR | Native | Fintech desk and form; AIS/PIS API portal; RON IBANs for Wise, Paysera, ZEN, iCard, TransferGo, Ebury, but only for EU-licensed firms ([Libra fintech](https://www.librabank.ro/fintech)) | 6-month RON 4.75%; terms 7 days to 36 months ([rates](https://www.librabank.ro/dobanzi-depozite-la-termen)) | **Primary** |
| **Raiffeisen Bank Romania** | Bank, BNR | Native | No BaaS; PSD2 sandbox **[Unverified live]**; hackathon co-presenter; iFactor partnership via Elevator Lab | Up to 6.5% RON; recurring and card-payment savings in app ([H1 2026](https://m.bvb.ro/FinancialInstruments/SelectedData/NewsItem/RBRO28-Rezultate-Financiare-S1-2026/8621E)) | **Backup** |
| Banca Transilvania / Salt Bank | Banks, BNR | Native | BT: PSD2 API Store (2019), Pago stake. Salt: Starling Engine, "Spaces", no partner API | Round Up; Spaces promos | Competitors, not rails |
| BCR, ING, CEC, UniCredit | Banks, BNR | Native | PSD2 APIs (BCR opened George, 2019; CEC via Finqware); no deposit BaaS found; UniCredit not researched deeply | Goals (BCR), Round Up (ING) | No BaaS |
| Techventures, Vista, First Bank, Patria | Banks, BNR | Native | Techventures API needs bank approval; others: PSD2 listings or business APIs only | Standard | No programme found |
| Mangopay | EMI, CSSF | RON "on request" for LU virtual accounts ([Jul 2026](https://docs.mangopay.com/release-notes/api/2026-07-07)), but [currencies page](https://docs.mangopay.com/guides/currencies) lists no RON wallets | Free sandbox; sales-led pricing; neobanks, stored value, money transfer restricted ([list](https://mangopay.com/prohibited-businesses)) | None | Fallback |
| Paysera, Filbo Pay | EMIs (Lithuania; BNR) | Yes | No BaaS found; Filbo is business-only | None | No |
| Lemonway, Swan, Treezor, Modulr, Railsr, Paynetics, Unlimit, Wallester | PI/EMIs | No RON accounts found (Lemonway, Modulr: outgoing RON only) | Real BaaS, EUR-first | None | No |

## Why Libra

- **Built for fintechs on RON rails:** a dedicated fintech intake, with Raiffeisen Digital Bank added in 2023 ([ZF](https://www.zf.ro/banci-si-asigurari/parteneriat-din-domeniul-fintech-libra-internet-bank-ofera-iban-uri-21964468)).
- **Legally clear:** a bank deposit in the student's name is the cleanest home for savings (`legal-and-payments.md` §1.1).
- **Locks:** 7-day to 36-month term deposits, with partial withdrawal after 30 days **[Unverified, advertorial]** ([source](https://financialintelligence.ro/depozitul-la-nevoie-se-cunoaste-libra-internet-bank-ofera-dobanzi-excelente-si-flexibilitate-reala-pentru-economiile-tale/)).
- **Fast KYC:** an online account in under 5 minutes, with real-time ID checks against the population register ([Revista Biz](https://www.revistabiz.ro/colaborare-intre-libra-internet-bank-si-evidenta-populatiei-pentru-validarea-identitatii-in-timp-real/)).
- **Size for a pilot:** mid-sized, 324m lei profit in 2025, rated BB by Fitch ([Agerpres](https://agerpres.ro/banci/2026/04/30/libra-internet-bank-a-raportat-un-profit-net-de-324-milioane-de-lei-in-2025--1551575)).

## Why Raiffeisen as backup

- **Hackathon presence:** it presents the VibeHack × NEXXT hackathon (Bucharest, 28 to 29 October 2026), alongside a Stripe challenge ([Revista Biz](https://www.revistabiz.ro/summit-la-bucuresti-pentru-dezvoltarea-solutiilor-ai-pentru-probleme-reale-de-business/)). Whether this is Kip's event is **[Unverified]**.
- **Youth focus:** under-25 zero fees and 8-minute digital onboarding ([Bursa, 2024](https://www.bursa.ro/-gen-z-cel-mai-dinamic-segment-de-clienti-raiffeisen-bank-47714357)).
- **Same architecture as Libra.** Downside: busy integrating Garanti BBVA, due Q4 2026 ([FinTech Futures](https://www.fintechfutures.com/m-a/raiffeisen-bank-secures-591m-deal-to-acquire-garanti-bbva-romania)).

## Integration (Libra)

| Piece | How |
|---|---|
| KYC | Libra's own online onboarding, deep-linked from Kip |
| Money | Student's Libra savings account or term deposit per goal; phase 2: sub-accounts via API |
| Top-ups | Default: free standing order or RoPay into the student's IBAN ([RoPay](https://www.ropay.ro/en/faq/)). Card top-ups only with Libra as merchant of record, never via Kip's Stripe balance **[Lawyer, Stripe]**; on 5 lei the card fee is 21.5% |
| Visibility | AIS via Libra API.Accounts, through a licensed AISP or the Libra contract **[Lawyer]** |
| Withdrawal, 48h | Phase 1: friction in Kip's UI only. Phase 2: Libra "notice pot" releasing after 48h, or a 7-day deposit |
| Parent match | Parent sends RoPay straight to the student's IBAN; Kip records the pledge and verifies via AIS |
| Kip revenue | Subscription on Kip's own Stripe account |

**Kip's legal role:** introducer and software provider that never receives funds. In phase 2, outsourced tech provider to Libra under the Banking Law outsourcing rules. We found no "deposit agent" status; agents and distributors exist only for PIs and EMIs ([Kinstellar](https://kinstellar.com/upload/BaaS%20Romania.pdf)) **[Lawyer]**. Under the Mangopay fallback, Kip would be an e-money distributor (Law 210/2019 Art. 46(2)).

## On stage

"Kip never holds your money: every leu sits in the student's own account at a Romanian bank, earning interest and covered by the deposit guarantee fund. Our target partner is Libra Internet Bank, which already powers RON accounts for fintechs like Wise, Paysera and ZEN. The demo runs in Stripe test mode, and nothing is signed yet."

## Honest limitations

- **Nothing signed, no contact yet.** Libra is the target because it has the clearest public record we found of Romanian banks partnering with fintechs on RON.
- **No product for us yet:** Libra's fintech product serves licensed firms (a collector account in their name). Kip needs a custom deal; pricing and minimums are unpublished.
- **Locks need the bank:** Kip can't enforce locks or the 48h cool-off until the bank builds them.
- **Card top-ups:** costly on small amounts, and the bank must be the merchant. Account-to-account (A2A) transfers are the default.
- **Rates change.** Raiffeisen's 6.5% may be for new money only.

## How to approach them

1. **Libra:** fintech form at librabank.ro/fintech, plus a one-page pilot proposal (100 students).
2. **Raiffeisen:** its mentors at the hackathon this week.
3. **Mangopay:** sandbox via the Dashboard.
4. **In parallel:** BNR FinTech Innovation Hub and RoFintech (`legal-and-payments.md` §1.7).

## Further sources

- VibeHack Bucharest (site JS bundle, fetched 28 October 2026: "Presented by Raiffeisen Bank"; "Company challenges from QA DNA, Stripe and Raiffeisen Bank"): https://vibehack.eu/cities/bucharest
- Libra API Banking: https://www.librabank.ro/API_Banking ; developer portal: https://apibanking.librabank.ro/devportal/
- Salt and Starling: https://www.Finextra.Com/newsarticle/43989/romanias-salt-goes-live-with-starlings-saas-platform
- Raiffeisen and iFactor: https://www.raiffeisen.ro/ro/despre-noi/comunicate-de-presa/2024/parteneriat-strategic-intre-raiffeisen-bank-si-fintech-ul-romanesc-ifactor-marele-castigator-al-rofin-tech-awards-gala.html
- BT API Store: https://startupcafe.ro/banca-transilvania-api-store-htm-9429
- BCR George APIs: https://profit.ro/povesti-cu-profit/financiar/bcr-transforma-george-in-platforma-de-open-banking-deschizand-o-pentru-antreprenorii-din-tehnologie-si-va-lansa-apple-pay-pentru-clienti-19030380
- Techventures: https://techventures.bank/api
- Paysera RON via Libra: https://www.zf.ro/banci-si-asigurari/fintech-ul-paysera-ofera-clientilor-conturi-iban-lei-parteneriat-19227503
- Filbo Pay: https://www.profit.ro/povesti-cu-profit/financiar/filbo-pay-obtine-autorizarea-ca-institutie-de-moneda-electronica-de-la-banca-nationala-a-romaniei-21540302
- Lemonway: https://support.lemonway.com/hc/en-us/articles/360015763337
- Modulr: https://knowledge.modulrfinance.com/knowledge-hub/what-currencies-do-you-support
- Treezor: https://www.treezor.com/services/local-iban/
- Paynetics: https://www.paynetics.digital/embedded-finance-2/
