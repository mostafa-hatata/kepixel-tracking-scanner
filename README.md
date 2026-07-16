# KePixel Universal Tracking & Funnel Scanner

KePixel Tracking Scanner is a public, vendor-neutral website audit API for detecting tracking technologies, evaluating public client-side and server-side evidence, mapping funnel readiness, and returning structured quality scores for GPT Actions and diagnostic tools.

It does **not** require access to KePixel or any private account. KePixel is one of many supported technologies.

## What v3 audits

- Client-side and server-side tracking evidence
- Advertising pixels and conversion tags
- Analytics, product analytics, CDPs, tag managers, session analytics, and consent platforms
- Ecommerce, lead-generation, SaaS, and content funnels
- Canonical events such as `view_item`, `add_to_cart`, `begin_checkout`, `purchase`, `lead`, and `sign_up`
- Public parameter evidence such as event ID, value, currency, transaction ID, content IDs, click IDs, and hashed identity keys
- Duplicate identifier risk, cookie lifetime risk, failed tracking requests, attribution readiness, and consent evidence
- Platform detection for Salla, Zid, Shopify, WooCommerce, Magento, BigCommerce, Webflow, WordPress, and custom sites

The scanner never returns cookie values, raw user data, access tokens, or captured request values. Browser request payloads are reduced to non-sensitive key names.

## Supported scan modes

| Mode | Behavior |
|---|---|
| `quick` | One-page safe HTTP scan. Fastest and does not launch Chromium. |
| `smart` | Default. Static multi-page discovery plus browser runtime/network capture with automatic static fallback. |
| `funnel` | Wider safe funnel-page discovery and browser evidence collection. It does not submit forms, add products, or place orders. |
| `deep` | Same safety rules as funnel mode with a larger evidence budget. |

## API endpoint

```text
POST https://kepixel-tracking-scanner.vercel.app/api/scan
Content-Type: application/json
```

Example request:

```json
{
  "url": "https://example.com",
  "mode": "smart",
  "max_pages": 3
}
```

`mode` and `max_pages` are optional. Existing GPT integrations that only send `url` remain compatible.

## Response compatibility

Schema v3 adds structured fields while retaining the original top-level fields used by existing GPT Actions:

- `overall_score`
- `tracking_health`
- `trackers_detected`
- `trackers_found_count`
- `scripts_detected`
- `network_requests_detected`
- `cookies_detected`
- `risk_assessment`
- `browser_signals`
- `server_side_detected`
- `recommendations`

New main sections include:

- `scores`
- `site`
- `technology_summary`
- `technologies`
- `tracking_ids`
- `funnel`
- `events`
- `parameter_quality`
- `server_side`
- `consent`
- `issues`
- `pages_scanned`
- `limitations`

## Score model

The overall score is normalized across checks that were actually assessable. Unknown server-side or purchase evidence is not automatically treated as a failure.

| Dimension | Weight |
|---|---:|
| Installation and loading | 15 |
| Funnel coverage | 25 |
| Event correctness | 20 |
| Parameter quality | 15 |
| Deduplication readiness | 10 |
| Server-side evidence | 5 |
| Attribution readiness | 5 |
| Consent and reliability | 5 |

The response also returns a separate confidence score and each dimension's assessability.

## Server-side interpretation

A public website scan cannot prove the absence of backend-to-backend tracking. The API therefore reports one of these evidence states instead of forcing a misleading boolean conclusion:

- `verified`
- `strong_evidence`
- `possible_evidence`
- `not_publicly_verifiable`

The legacy `server_side_detected` field remains for compatibility and is only `true` when strong public evidence exists.

## Safety and privacy

The scanner includes:

- URL scheme and credential validation
- DNS checks that block private, loopback, link-local, and metadata targets
- Redirect validation on every hop
- Browser subrequest blocking for private-network targets
- Response-size, redirect, page-count, navigation, and execution limits
- Best-effort per-instance rate limiting
- No form submission, checkout completion, payment action, login action, or purchase
- No cookie values or raw PII in the API response

## Local validation

```bash
npm install
npm run check
npm test
```

## GPT Action schema

An OpenAPI schema is provided in [`openapi.yaml`](./openapi.yaml). The production action can continue using the same `/api/scan` endpoint.
