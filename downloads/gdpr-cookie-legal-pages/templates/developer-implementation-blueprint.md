# Developer Implementation Blueprint

Status: Technical draft for lawyer review.

## Required app surfaces

Create or adapt these surfaces according to the framework:

- `/privacy`
- `/cookies`
- `/terms`
- cookie banner component
- cookie preferences modal
- persistent `Cookie settings` footer link
- consent API/backend if server exists
- privacy request API/form

## Consent categories

- strictly necessary: always active, disclosed, cannot be disabled
- preferences: optional
- analytics: optional
- marketing: optional
- support/communications: optional

## API contract

### GET `/api/consent`

Returns current consent state.

```json
{
  "policyVersion": "2026-06-30",
  "bannerVersion": "1.0.0",
  "categories": {
    "necessary": true,
    "preferences": false,
    "analytics": false,
    "marketing": false,
    "support": false
  }
}
```

### POST `/api/consent`

Stores consent event and sets consent cookie.

Input:

```json
{
  "eventType": "customize",
  "policyVersion": "2026-06-30",
  "bannerVersion": "1.0.0",
  "language": "en",
  "categories": {
    "necessary": true,
    "preferences": false,
    "analytics": true,
    "marketing": false,
    "support": false
  },
  "vendors": ["example-analytics-vendor"],
  "sourceUrl": "/"
}
```

Validation:

- `necessary` must always be `true`.
- Optional categories must be explicit booleans.
- Unknown categories rejected.
- Vendor list must match documented vendors.
- Rate-limit requests.
- Store event with timestamp and version.

### POST `/api/consent/withdraw`

Sets all optional categories to false and logs withdrawal.

### POST `/api/privacy-request`

Accepts request type:

- access
- correction
- deletion
- export/portability
- objection
- restriction
- withdraw consent
- other

Collect only necessary fields:

- email
- name optional
- request type
- message

Do not ask for ID documents unless the lawyer/organization has a verification process.

## Database model

Use equivalent schema:

```sql
create table consent_events (
  id uuid primary key default gen_random_uuid(),
  consent_id text not null,
  user_id uuid null,
  event_type text not null,
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
```

## Script gating

Do not load optional scripts in the root layout.

Bad:

```tsx
<Script src="https://www.googletagmanager.com/gtag/js?id=G-XXXX" />
```

Better:

```tsx
{consent.analytics ? <AnalyticsLoader /> : null}
```

Strictest:

- no Google/Meta/ad-tech script before explicit consent
- no Google Fonts from Google CDN
- no Google Maps live embed before consent
- no YouTube live iframe before consent
- no reCAPTCHA before consent unless lawyer-approved as strictly necessary

## Acceptance tests

- Fresh visit sets only strictly necessary consent/session/security cookies.
- Fresh visit sends no requests to Google/Meta/ad-tech/heatmap/session replay domains.
- Reject non-essential does not load optional scripts.
- Customize analytics loads analytics only.
- Customize marketing loads marketing only.
- Withdraw disables optional scripts on next page load and clears optional cookies where feasible.
- Footer Cookie settings link always reopens modal.
- Consent event is logged with policy/banner version.
- Privacy request form works and is rate-limited.
