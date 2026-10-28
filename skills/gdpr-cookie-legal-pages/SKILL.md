---
name: gdpr-cookie-legal-pages
version: 2.0.0
last-reviewed: 2026-06-30
description: Claude Code skill for researching, drafting, and implementing GDPR/ePrivacy-ready Privacy Policy, Cookie Policy, Terms pages, cookie consent UI, consent logging, vendor/data maps, and lawyer-review packets for web apps. Use when building or auditing legal/privacy pages, cookie banners, tracker blocking, consent backend, data processing documentation, or EU/Romania privacy implementation. Produces drafts and code designed for legal review, never final legal advice.
argument-hint: "[app/site description, jurisdiction, target users, business facts, vendors, framework, build-or-audit]"
---

# GDPR Cookie Legal Pages Skill

This skill helps Claude Code research, draft, and implement privacy/legal pages and cookie consent infrastructure for a web app, with a strong EU/GDPR/ePrivacy focus and a Romania-ready path.

The output is always **Draft for lawyer review**. Never tell the user the app is compliant. Say the implementation is designed to support compliance and must be reviewed by qualified counsel. A privacy policy is not a magic invisibility cloak for trackers. Sadly, many humans keep trying.

## Primary mission

When the user asks for GDPR, cookies, terms, privacy pages, legal pages, cookie popups, cookie consent, privacy backend, processor maps, or lawyer packets, do not only write generic policy text.

Do all of this, unless the user explicitly asks only for a smaller task:

1. Inspect the real app or repo.
2. Research current official/high-authority sources.
3. Build a data map from code evidence.
4. Identify cookies, storage, scripts, network destinations, vendors, processors, and risky flows.
5. Draft the user-facing pages:
   - Privacy Policy
   - Cookie Policy
   - Terms of Service / Terms of Use
   - Cookie banner first layer
   - Cookie preferences modal
   - Privacy rights/contact text
   - Consent withdrawal instructions
   - Data deletion/export request text
6. Implement the routes/components/API/backend needed by the app, if editing the project is in scope.
7. Block non-essential trackers before consent.
8. Prevent accidental data transfer to Google, Meta, ad-tech, analytics, support widgets, maps, fonts, video embeds, or other third parties before the user has consented or another lawyer-approved legal basis applies.
9. Produce a lawyer-review packet with assumptions, open questions, sources, data map, vendor map, cookie inventory, risk register, and implementation notes.

## Claude Code behavior

### If project files are available

Start by inspecting the project. Do not begin with a giant questionnaire unless required facts cannot be inferred.

Use available Claude Code tools. Prefer `Read`, `Glob`, `Grep`, `Bash`, `Edit`, `MultiEdit`, and `Write` where available.

Run or approximate these searches from the repo root:

```bash
pwd
find . -maxdepth 3 -iname 'package.json' -o -iname 'pnpm-lock.yaml' -o -iname 'yarn.lock' -o -iname 'bun.lockb' -o -iname 'next.config.*' -o -iname 'vite.config.*' -o -iname 'astro.config.*' -o -iname 'nuxt.config.*'
rg -n "(gtag|GTM-|googletagmanager|google-analytics|analytics.google|doubleclick|googleadservices|adsbygoogle|google\.com/recaptcha|recaptcha|googleapis|gstatic|fonts\.googleapis|maps\.google|youtube|youtube-nocookie|vimeo|fbq|connect\.facebook\.net|facebook\.com/tr|Meta Pixel|tiktok|snapchat|pinterest|hotjar|clarity|fullstory|logrocket|posthog|mixpanel|segment|amplitude|plausible|matomo|sentry|datadog|newrelic|intercom|crisp|tawk|zendesk|hubspot)" .
rg -n "(localStorage|sessionStorage|document\.cookie|Set-Cookie|cookies\(|headers\(\)\.set|NextResponse|cookieStore|indexedDB|navigator\.sendBeacon)" .
rg -n "(email|e-mail|phone|telefon|address|name|nume|booking|appointment|payment|stripe|invoice|call|voice|recording|transcript|sms|whatsapp|support|chat|customer|client|salon|minor|children|health|medical|biometric|location|IP address|user_agent|userAgent)" .
rg -n "(SUPABASE|DATABASE_URL|STRIPE|TWILIO|SENDGRID|RESEND|MAILGUN|ELEVENLABS|OPENAI|ANTHROPIC|SENTRY|VERCEL|CLOUDFLARE|GOOGLE|META|FACEBOOK|GA_|GTM_|POSTHOG|MIXPANEL|SEGMENT|AMPLITUDE|HOTJAR|CLARITY)" .env* . 2>/dev/null
```

Also inspect:

- `package.json`, lockfiles, dependency names, scripts.
- App router/page router/routes folder.
- Layout/root components where global scripts are loaded.
- HTML head/meta/script injection.
- Middleware and API routes.
- Auth/session code.
- Database schema/migrations/ORM models.
- Server logs/error logging.
- Client analytics initialization.
- Payment/checkout code.
- Email/SMS/voice/call/transcription code.
- CDN/hosting config.
- Footer/nav where legal links should appear.

Then build an evidence-based product/data map before drafting.

### If project files are not available

Ask only for the minimum missing information, then still produce a working draft structure and implementation plan. Minimum facts:

- site/app name
- legal entity/controller name
- registered address/country
- contact email
- target users and countries served
- whether minors are targeted
- main app features
- vendors/processors used
- analytics/ads/support/chat/payments/AI tools used
- whether calls, recordings, transcripts, health data, biometric data, location, or sensitive data are processed
- desired language(s)

Do not invent company details. Use bracketed placeholders like `[Legal entity name]`.

## Source research protocol

Before drafting legal/compliance claims, research current official/high-authority sources online. If online research is unavailable, label the output **Research-required draft** and list the exact sources that must be checked before publication.

Record each source with:

- exact title
- publisher/authority
- URL
- date accessed
- last updated/effective date if visible
- rule supported
- relevance to the app
- uncertainty or jurisdiction limits

### Required EU/Romania source registry

Check these sources first for EU/Romania work. Use the current live version, not memory.

1. GDPR legal text, EUR-Lex
   - https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng
   - Check especially Articles 4, 5, 6, 7, 9, 12-14, 15-22, 25, 28, 30, 32, 35, 44-49.

2. ePrivacy Directive legal text, EUR-Lex
   - https://eur-lex.europa.eu/eli/dir/2002/58/oj/eng
   - Check Article 5(3) for storing/accessing information on user devices and the strictly necessary exception.

3. EDPB Guidelines 05/2020 on consent under GDPR
   - https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-052020-consent-under-regulation-2016679_en
   - Use for consent quality: freely given, specific, informed, unambiguous, withdrawal, imbalance, bundling, cookie walls.

4. EDPB Cookie Banner Taskforce report
   - https://www.edpb.europa.eu/system/files/2023-01/edpb_20230118_report_cookie_banner_taskforce_en.pdf
   - Use for cookie-banner anti-patterns: no reject option, pre-ticked boxes, deceptive colors, legitimate interest confusion, inaccurate categories, withdrawal problems.

5. EDPB Guidelines 2/2023 on the technical scope of Article 5(3) ePrivacy Directive, final version
   - https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-22023-technical-scope-art-53-eprivacy-directive_en
   - Use for cookies and similar technologies beyond normal cookies: SDKs, local identifiers, tracking pixels, localStorage, access to device/browser information.

6. EDPB Guidelines 03/2022 on deceptive design patterns
   - https://www.edpb.europa.eu/documents/guideline/guidelines-032022-on-deceptive-design-patterns-in-social-media-platform_en
   - Use as design guidance against manipulative consent/privacy UI.

7. European Commission cookies policy
   - https://commission.europa.eu/cookies-policy_en
   - Use as a practical public-sector example of necessary cookies vs consent-based cookies, not as universal legal advice.

8. ANSPDCP Romania main site and cookie/legal references
   - https://www.dataprotection.ro/
   - https://www.dataprotection.ro/index.jsp?lang=en&page=Cookies
   - https://www.dataprotection.ro/servlet/ViewDocument?id=173
   - https://legislatie.just.ro/Public/DetaliiDocument/56973
   - Use for Romanian authority context and Law no. 506/2004, especially if the business is Romanian or targets Romania.

9. CNIL cookies and trackers guidance
   - https://www.cnil.fr/en/tag/Cookies%2Band%2Btracking%2Bdevices
   - Use for practical consent-banner patterns and tracker inventory discipline, especially because CNIL has strong cookie enforcement practice.

10. ICO cookies and similar technologies guidance
   - https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/cookies-and-similar-technologies/
   - Use for practical explanations of cookie consent, positive action, and accessibility. Mark UK jurisdiction limits when the project is EU-only.

### Vendor source registry

For each detected vendor, check the official DPA, privacy, subprocessor, transfer, retention, and data residency docs. Do not rely on marketing pages alone, because apparently “enterprise-ready” can mean “we found a stock photo of a lock.”

Common vendor sources to check when detected:

- Google / Google Analytics / Google Ads / Tag Manager
  - EU User Consent Policy: https://www.google.com/about/company/user-consent-policy/
  - Consent Mode developer docs: https://developers.google.com/tag-platform/security/guides/consent
  - Consent Mode EEA updates: https://support.google.com/tagmanager/answer/13695607
  - Google Ads privacy statement: https://safety.google/intl/en/safety/ads-data/
  - Check the exact product terms actually used: GA4, Ads, Tag Manager, Maps, Fonts, reCAPTCHA, YouTube embeds.

- Supabase
  - DPA: https://supabase.com/legal/dpa
  - Trust Center: https://trust.supabase.io/
  - Check project region, auth, logs, backups, storage, edge functions, RLS, and whether usage data is separately processed.

- Vercel
  - DPA: https://vercel.com/legal/dpa
  - Security/compliance: https://vercel.com/docs/security/compliance
  - Subprocessors: https://vercel.com/legal/sub-processors
  - Check edge regions, logs, analytics, speed insights, web analytics, and deployment data.

- Cloudflare
  - DPA and privacy terms from Cloudflare official legal pages.
  - Check CDN/WAF logs, Turnstile, Workers, Zaraz, Web Analytics, and EU data localization settings.

- Twilio / SendGrid / Segment
  - DPA: https://www.twilio.com/en-us/legal/data-protection-addendum
  - Subprocessors: https://www.twilio.com/en-us/legal/sub-processors
  - GDPR: https://www.twilio.com/en-us/gdpr
  - Check SMS, voice, call recordings, transcriptions, conversations, messaging logs, and regional processing.

- ElevenLabs
  - DPA: https://elevenlabs.io/dpa
  - Data residency: https://elevenlabs.io/docs/overview/administration/data-residency
  - Trust center: https://compliance.elevenlabs.io/
  - Check voice data, call/audio retention, moderation access, EU residency limitations, subprocessors, and whether voice/recording consent is required.

- Stripe
  - DPA, privacy center, subprocessors, and payment data roles from official Stripe legal docs.
  - Check whether the app stores card data, customer IDs, invoices, billing addresses, tax data, webhooks.

- Sentry / Datadog / New Relic / LogRocket / FullStory / Hotjar / Microsoft Clarity
  - Check DPA, session replay settings, masking, IP/user-agent logging, regional storage, subprocessors.
  - Treat session replay and heatmaps as high risk and consent-based unless a lawyer confirms otherwise.

- Email providers: Resend, Mailgun, Postmark, AWS SES, SendGrid
  - Check DPA, subprocessors, regions, event tracking pixels, open/click tracking.
  - Disable open/click tracking unless disclosed and lawful.

If a vendor is present but no official DPA or transfer documentation is found, mark it as **High-risk unresolved vendor**.

## Consent and cookie law principles to enforce

Apply these as implementation requirements, not decorative bullet points.

1. Do not set or access non-essential cookies, localStorage, SDK identifiers, pixels, fingerprinting signals, or analytics storage before consent.
2. Strictly necessary cookies/storage may be used without consent only when required to provide a user-requested service, security, authentication, routing, checkout/booking continuity, or consent storage. Still disclose them.
3. Consent must be freely given, specific, informed, and unambiguous.
4. Consent requires clear affirmative action. “By continuing to browse” is not enough.
5. No pre-ticked boxes, pre-enabled optional toggles, or silent defaults for analytics/marketing/support trackers.
6. If “Accept all” exists at the first layer, provide “Reject non-essential” or equivalent at the same layer with comparable visibility.
7. Make withdrawal/change as easy as giving consent. Add a persistent footer link: “Cookie settings”.
8. Provide granular choices by purpose/category and identify meaningful vendors.
9. Do not bury rejection in a second layer while acceptance is on the first layer.
10. Do not use manipulative visual hierarchy, misleading colors, “necessary” labels for optional tracking, fake toggles, or guilt-copy.
11. Do not block access only because the user rejects non-essential cookies unless the exact business model has lawyer approval.
12. Store consent evidence: timestamp, consent ID, policy/banner version, categories chosen, vendors/purposes shown, source page, jurisdiction/language, and withdrawal/change events.
13. Minimize consent logs. Hash or avoid IP/user-agent unless counsel confirms they are needed as evidence.
14. Re-prompt only when purposes/vendors/policies materially change, consent expires by policy, or the user clears preferences.
15. Do not use server-side tracking to bypass rejected browser consent. That is not clever. It is just worse with extra infrastructure.

## “No accidental data to Google/ad-tech” mode

When the user is worried about data going to Google, Meta, or ad-tech, implement the stricter mode by default.

### Strict rule

No request leaves the browser or server to Google, Meta, TikTok, ad networks, analytics providers, heatmap tools, session replay tools, or embedded media providers until the required consent exists or counsel confirms another legal basis.

This includes:

- Google Tag Manager
- Google Analytics / GA4
- Google Ads / conversion linker
- DoubleClick
- Google Fonts from `fonts.googleapis.com` or `fonts.gstatic.com`
- Google Maps embeds/scripts
- Google reCAPTCHA
- YouTube embeds, even `youtube-nocookie`, unless evaluated
- Meta Pixel
- TikTok Pixel
- Hotjar, Clarity, FullStory, LogRocket
- Any SDK that phones home before opt-in

### Implementation decisions

Prefer:

- self-hosted fonts instead of Google Fonts
- static map image or address text instead of live Google Maps before consent
- placeholder click-to-load embeds for YouTube/Maps/Vimeo
- server-side form validation instead of reCAPTCHA when possible
- privacy-friendly analytics with legal review, or no analytics until consent
- first-party logs with PII redaction
- CSP allowlists that start strict and only permit necessary destinations

If Google Consent Mode is used, set default consent to denied before any Google tag executes. For the stricter “no data to Google before consent” requirement, do not load Google tags at all until consent. Consent Mode can reduce/adjust collection, but it is not the same as zero network contact.

### Network leak test

After implementation, run a browser test in a clean profile before interacting with the banner. There must be no network requests to:

```text
google-analytics.com
googletagmanager.com
googleadservices.com
doubleclick.net
analytics.google.com
fonts.googleapis.com
fonts.gstatic.com
gstatic.com
google.com/recaptcha
maps.googleapis.com
youtube.com
youtube-nocookie.com
facebook.com
connect.facebook.net
tiktok.com
hotjar.com
clarity.ms
fullstory.com
logrocket.com
```

If any are present, either remove the integration, gate it behind consent, or document why it is strictly necessary and lawyer-approved.

## Implementation targets by framework

When editing a project, create files matching the framework. Do not force Next.js patterns into a Vite app like a confused toaster.

### Next.js App Router target

Create or update:

```text
app/privacy/page.tsx
app/cookies/page.tsx
app/terms/page.tsx
app/api/consent/route.ts
app/api/privacy-request/route.ts
components/ConsentBanner.tsx
components/CookiePreferencesModal.tsx
components/CookieSettingsLink.tsx
lib/consent/categories.ts
lib/consent/server.ts
lib/consent/client.ts
lib/legal/site-config.ts
lib/legal/policy-versions.ts
```

Add footer links:

```text
Privacy Policy
Cookie Policy
Terms
Cookie settings
```

Avoid putting GTM/GA scripts in `app/layout.tsx`. If already present, remove them or gate them.

### Next.js Pages Router target

Create or update:

```text
pages/privacy.tsx
pages/cookies.tsx
pages/terms.tsx
pages/api/consent.ts
pages/api/privacy-request.ts
components/ConsentBanner.tsx
components/CookiePreferencesModal.tsx
lib/consent/*
lib/legal/*
```

### Vite/React target

Create or update:

```text
src/pages/Privacy.tsx
src/pages/Cookies.tsx
src/pages/Terms.tsx
src/components/ConsentBanner.tsx
src/components/CookiePreferencesModal.tsx
src/components/CookieSettingsLink.tsx
src/lib/consent/categories.ts
src/lib/consent/client.ts
src/lib/legal/siteConfig.ts
src/lib/legal/policyVersions.ts
```

If the app has no backend, create a client-only consent store and a developer ticket to add server-side consent logging.

### Astro/Nuxt/SvelteKit/remix/generic target

Use the native routing/API conventions. Maintain the same concepts:

- legal pages
- consent banner
- preference modal
- consent state store
- backend endpoint if available
- no tracker load before consent
- footer/legal nav
- lawyer packet

## Consent backend specification

Implement a backend if the project has server/API capability.

### Data model

Create a consent record table/model equivalent to:

```sql
create table consent_events (
  id uuid primary key default gen_random_uuid(),
  consent_id text not null,
  user_id uuid null,
  event_type text not null check (event_type in ('initial_accept','initial_reject','customize','update','withdraw','policy_refresh')),
  policy_version text not null,
  banner_version text not null,
  language text not null default 'en',
  region text null,
  categories jsonb not null,
  vendors jsonb not null default '[]'::jsonb,
  purposes jsonb not null default '[]'::jsonb,
  source_url text null,
  referrer_host text null,
  ip_hash text null,
  user_agent_hash text null,
  created_at timestamptz not null default now()
);

create index consent_events_consent_id_idx on consent_events (consent_id);
create index consent_events_user_id_idx on consent_events (user_id);
```

If not using Postgres, adapt to the project database.

### Data minimization

Do not store raw IP address or full user-agent unless counsel requests it. If evidence is needed, hash with a server-side secret salt:

```text
sha256(consentAuditSalt + rawValue)
```

Do not expose the salt to the client. Rotate only with a documented plan, because consent evidence can become unlinkable.

### API behavior

Create endpoints or server actions equivalent to:

```text
GET /api/consent
POST /api/consent
PUT /api/consent
DELETE /api/consent or POST /api/consent/withdraw
POST /api/privacy-request
```

`GET /api/consent` returns current consent state.

`POST /api/consent` validates category booleans, stores event, sets the consent cookie, and returns current state.

`PUT /api/consent` stores an update event and updates the cookie.

`withdraw` sets all non-essential categories to false and stores a withdrawal event.

`POST /api/privacy-request` accepts data subject requests, validates contact fields, rate-limits submissions, stores/minimizes request data, and sends to the privacy contact if email infrastructure exists.

### Consent cookie

Use a strictly necessary consent cookie. Prefer:

```text
__Host-consent=<signed compact JSON or opaque consent id>
Secure; SameSite=Lax; Path=/; Max-Age=15552000
```

Use `HttpOnly` if the server can inject consent state into the page. If client-side code must read categories, use a minimal readable preference cookie and a separate HttpOnly audit ID. Do not put personal data in the cookie.

Suggested consent state:

```json
{
  "v": "2026-06-30",
  "banner": "1.0.0",
  "necessary": true,
  "preferences": false,
  "analytics": false,
  "marketing": false,
  "support": false
}
```

### Category schema

Use these default categories unless the app clearly needs different ones:

```ts
export const CONSENT_CATEGORIES = {
  necessary: {
    required: true,
    label: 'Strictly necessary',
    description: 'Required for security, login, booking/checkout flow, and remembering cookie choices.'
  },
  preferences: {
    required: false,
    label: 'Preferences',
    description: 'Remember language, region, layout, and similar choices.'
  },
  analytics: {
    required: false,
    label: 'Analytics',
    description: 'Help us understand usage and improve the product.'
  },
  marketing: {
    required: false,
    label: 'Marketing',
    description: 'Measure campaigns, personalize ads, and support remarketing.'
  },
  support: {
    required: false,
    label: 'Support and communications',
    description: 'Enable optional chat, support widgets, call widgets, and similar tools.'
  }
} as const;
```

### Script gating pattern

Never initialize non-essential vendors in a root layout without a consent check.

Use a loader like:

```ts
export function loadScriptOnce(id: string, src: string, attrs: Record<string, string> = {}) {
  if (typeof window === 'undefined') return;
  if (document.getElementById(id)) return;
  const script = document.createElement('script');
  script.id = id;
  script.src = src;
  script.async = true;
  for (const [key, value] of Object.entries(attrs)) script.setAttribute(key, value);
  document.head.appendChild(script);
}
```

Then load only after consent:

```ts
if (consent.analytics) {
  // load analytics provider here
}

if (consent.marketing) {
  // load ads/pixels here
}

if (consent.support) {
  // load chat/support widgets here
}
```

For zero-Google-before-consent mode, do not call Google Consent Mode or load GTM until consent. If the user explicitly wants Consent Mode, set default denied before loading and document that Google endpoints may still receive cookieless pings depending on configuration.

### Server-side event forwarding

Do not send events to Google/Meta/analytics from the backend unless:

- the relevant consent category exists,
- the event is compatible with the disclosed purpose,
- PII is minimized or removed,
- the vendor is listed in the policy,
- the transfer/legal basis is documented,
- the action is logged in the vendor map.

Server-side tracking is still tracking. Plumbing it through your own backend does not baptize it.

## Required legal pages

Every generated page must start visibly or in a developer comment with:

```text
Draft for lawyer review. Do not publish as final legal text until reviewed by qualified counsel.
```

For production UI, the visible warning can be removed only after the user/lawyer approves. In generated drafts and packets, keep it visible.

### Privacy Policy must include

- controller identity and contact
- what the app does
- categories of personal data collected
- sources of data
- purposes of processing
- lawful bases, marked as assumptions for lawyer review
- account/booking/payment/support/AI/call/analytics/marketing/security processing
- cookies and similar technologies cross-reference
- vendors/processors and categories
- international transfers and safeguards, if applicable
- retention periods or criteria
- user rights under GDPR
- how to exercise rights
- right to complain to supervisory authority, including ANSPDCP if Romania-relevant
- minors/children statement
- automated decision-making/profiling statement, if relevant
- security summary
- policy changes/versioning

### Cookie Policy must include

- what cookies/local storage/tracking technologies are
- categories used
- strictly necessary cookies disclosed separately
- optional categories and consent requirement
- vendor table
- cookie/storage inventory table
- how to change/withdraw consent
- browser controls
- contact details
- last updated/version

### Terms must include

Terms are not GDPR documents, but users expect them next to privacy pages, because apparently every website must now have a little legal museum.

Include:

- service description
- account eligibility
- user obligations
- bookings/orders/payments/cancellations/refunds if relevant
- acceptable use
- user content/uploads
- AI/automated features disclaimers if relevant
- third-party services
- intellectual property
- availability changes
- liability limitations, clearly marked for lawyer review
- termination/suspension
- governing law/jurisdiction placeholder
- contact

Do not fabricate refund rules or consumer terms. If the app is B2C in the EU, flag consumer-law review.

## Cookie banner and preference modal requirements

### First layer copy pattern

Must include:

- short explanation of cookie/tracker purposes
- statement that strictly necessary cookies are always active
- equal-path choices:
  - Accept all
  - Reject non-essential
  - Customize
- links to Privacy Policy and Cookie Policy

Example:

```text
We use strictly necessary cookies to run this site. With your choice, we may also use optional cookies and similar technologies for preferences, analytics, marketing, and support tools. You can accept all, reject non-essential cookies, or customize your choices. You can change your choice at any time from Cookie settings.
```

Buttons:

```text
Reject non-essential
Customize
Accept all
```

Do not use only “OK”. Do not say “By continuing, you agree”. Do not make rejection look disabled or secondary if acceptance is primary.

### Preference modal

Required sections:

- Strictly necessary: always on, disabled toggle, explanation
- Preferences: optional toggle
- Analytics: optional toggle
- Marketing: optional toggle
- Support/communications: optional toggle
- vendor details link or collapsible table
- Save choices
- Reject non-essential
- Accept all

All optional toggles default off before consent.

### Cookie settings link

Add persistent access in footer:

```text
<button type="button" data-open-cookie-settings>Cookie settings</button>
```

Do not hide withdrawal inside a policy page only.

## App inspection data map

Create this table from code evidence and user facts:

| Feature | Data collected | Purpose | Lawful basis assumption | Vendor/processor | Storage | Retention assumption | Risk notes | Evidence |
|---|---|---|---|---|---|---|---|---|

Lawful basis examples, to be reviewed by lawyer:

- account creation: contract or pre-contractual steps
- security logs: legitimate interests or legal obligation depending context
- payments/invoices: contract and legal obligation
- marketing emails: consent or soft opt-in depending jurisdiction
- analytics cookies: consent, unless lawyer-approved exemption applies
- marketing pixels: consent
- call recordings/transcripts: consent/legal obligation/legitimate interest depending jurisdiction and disclosure, high-risk
- AI voice assistant: contract/legitimate interests/consent depending data and use case, high-risk if recordings/transcripts/voice data

Always mark lawful basis as **assumption for lawyer review**.

## Cookie/tracker inventory

Create or update an inventory:

| Name/key | Provider | First/third party | Category | Purpose | Duration | Trigger | Set before consent? | Consent required? | User-facing explanation | Block/remove method | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|

Include cookies, localStorage, sessionStorage, IndexedDB, pixels, SDK IDs, and server-set cookies.

## High-risk escalations

Flag these clearly and recommend specialist lawyer review:

- children/minors targeted
- health data or medical context
- biometric data, voiceprints, facial recognition
- precise location tracking
- payment/financial data beyond normal processor flow
- call recordings/transcripts
- AI agent handling personal or sensitive data
- automated decisions with legal/significant effects
- employee monitoring
- session replay/keystroke/mouse tracking
- fingerprinting
- advertising pixels
- data transfers outside EEA
- use of Google/Meta ad-tech with EU users
- cookie walls / pay-or-consent models

## Output structure

Every full run must produce these sections:

### 1. Executive status

- What was inspected
- What was implemented/drafted
- What is still missing
- Main risks
- Whether lawyer review is required: always yes

### 2. Research notes

Source table:

| Source | Authority/publisher | Date accessed | Supports | Relevance | Notes |
|---|---|---|---|---|---|

### 3. Product/data map

Evidence-based table from the app.

### 4. Cookie/tracker inventory

Evidence-based table.

### 5. Draft user-facing pages

Include full drafts for:

- Privacy Policy
- Cookie Policy
- Terms

Use clear language. Avoid fake legal precision.

### 6. Consent UI copy

Include:

- banner first layer
- preference modal labels/descriptions
- button text
- footer link text
- withdrawal copy

### 7. Implementation performed or implementation tickets

If code was edited, list files changed and behavior.

If not edited, create developer tickets with acceptance criteria.

### 8. Lawyer-review packet

Include:

- business facts
- assumptions
- open questions
- source table
- data map
- vendor/processor table
- cookie inventory
- draft pages
- consent flow description
- risk register
- implementation checklist
- version table

## Developer tickets template

Each ticket must include:

```text
Title:
Reason:
Files/areas:
Implementation steps:
Acceptance criteria:
Test method:
Risk if skipped:
```

Required tickets unless already implemented:

1. Add Privacy/Cookie/Terms pages.
2. Add consent banner and preference modal.
3. Block non-essential scripts before consent.
4. Add consent backend/logging.
5. Add persistent Cookie settings link.
6. Replace or gate Google Fonts/Maps/YouTube/reCAPTCHA.
7. Add vendor/data map documentation.
8. Add privacy request endpoint/form.
9. Add policy versioning.
10. Test network leakage before consent.
11. Test reject flow.
12. Test withdrawal flow.
13. Prepare lawyer packet.

## Testing protocol

Run what is appropriate for the repo.

### Static checks

```bash
rg -n "(googletagmanager|google-analytics|doubleclick|facebook|hotjar|clarity|fullstory|logrocket|fonts\.googleapis|maps\.google|recaptcha|youtube)" .
rg -n "(document\.cookie|localStorage|sessionStorage|Set-Cookie|cookies\()" .
```

### Browser/manual checks

In a fresh private browser profile:

1. Open the site.
2. Do not interact with the banner.
3. Inspect cookies, localStorage, sessionStorage, IndexedDB.
4. Inspect Network tab.
5. Confirm only necessary cookies/storage and no optional vendor requests.
6. Click Reject non-essential.
7. Confirm optional vendors still do not load.
8. Click Cookie settings and enable analytics.
9. Confirm only analytics loads, not marketing/support.
10. Withdraw consent.
11. Confirm optional scripts stop loading on next page load and cookies/storage are cleared where feasible.

### Automated Playwright concept

If the project uses Playwright or can add tests, create tests that fail on known third-party domains before consent:

```ts
const blockedBeforeConsent = [
  'google-analytics.com',
  'googletagmanager.com',
  'doubleclick.net',
  'googleadservices.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'connect.facebook.net',
  'facebook.com',
  'hotjar.com',
  'clarity.ms',
  'youtube.com',
  'google.com/recaptcha',
];
```

Listen to requests before banner interaction and assert none match.

## Quality rules

- Never say “GDPR compliant” as a final guarantee.
- Never use generic policy text that contradicts the app evidence.
- Never say Google sells personal data as a legal fact unless a cited source supports the exact claim. Instead say: “Google/ad-tech may receive or process personal data or device information; avoid unconsented disclosure.”
- Never install a CMP or tracker without explaining what it does.
- Never use “legitimate interest” for analytics/marketing cookies without lawyer review.
- Never add Google Fonts from Google CDN in strict mode.
- Never leave GTM in the root layout while pretending cookies are blocked.
- Never call a vendor “processor” if the vendor docs indicate independent controller or mixed roles. Mark uncertainty.
- Never fabricate retention periods. Use assumptions and placeholders.
- Never hide reject/withdrawal.
- Never write final legal advice.

## Final user response style

When finished, tell the user:

- what files/pages/components/API were created or drafted
- what tracking/data leak protections were added
- what sources were checked
- what remains for the lawyer
- how to test quickly

Keep it direct. The user wants buildable output, not a sermon wrapped in a PDF costume.
