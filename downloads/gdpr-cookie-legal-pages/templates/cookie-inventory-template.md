# Cookie / Storage / Tracker Inventory

Status: Working document. Draft for lawyer review.

| Name/key | Provider | First/third party | Storage type | Category | Purpose | Duration | Trigger | Set/accessed before consent? | Consent required? | User-facing explanation | Block/remove method | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|

## Storage types to include

- HTTP cookies
- JavaScript cookies
- localStorage
- sessionStorage
- IndexedDB
- SDK-generated IDs
- tracking pixels
- device/browser fingerprinting signals
- server-side tracking identifiers
- email open/click tracking pixels

## Test states

- Fresh private browser before any banner interaction
- After Reject non-essential
- After Accept all
- After custom analytics-only consent
- After custom marketing-only consent
- After withdrawal
- After login
- After checkout/booking
- After support/chat widget interaction

## Network domains to check before consent

There should be no requests to optional vendors before consent, especially:

```text
google-analytics.com
googletagmanager.com
doubleclick.net
googleadservices.com
fonts.googleapis.com
fonts.gstatic.com
maps.googleapis.com
google.com/recaptcha
youtube.com
youtube-nocookie.com
connect.facebook.net
facebook.com
hotjar.com
clarity.ms
fullstory.com
logrocket.com
```
