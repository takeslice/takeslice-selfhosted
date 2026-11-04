# TakeSlice Self-Hosted

**Your affiliate program. Your infrastructure. Your rules.**

TakeSlice is an open-source, self-hosted affiliate management platform for SaaS businesses and online products. Run your own affiliate program, review applications, issue referral links and coupon codes, track attributed sales, manage commissions and refunds, and pay affiliates manually — with every record in your own PostgreSQL database.

No marketplace. No platform fee. No shared tenancy. No npm package or cloud account required.

[Quick start](#quick-start) · [Features](#features-available-today) · [Integrations](#payment-provider-integrations) · [Roadmap](#roadmap) · [GitHub](https://github.com/takeslice/takeslice-selfhosted)

Licensed under AGPL-3.0-only.

> **Project status:** release candidate. The core loop is implemented, audited and covered by end-to-end tests against PostgreSQL: setup, affiliate applications, tracking, provider webhooks, commission lifecycle, refunds, manual payouts, and the partner earnings view. It is suitable for a controlled production pilot after a full test-mode cycle. Reporting, embedded referrals and some provider-specific refund events are still on the roadmap, and only Stripe has been exercised against a real provider sandbox so far.

---

## Why TakeSlice?

Building an affiliate program should not mean building an affiliate management system from scratch.

TakeSlice gives you the core infrastructure for running a program around the product you already sell:

- **Self-hosted** — run everything on your own server with Docker Compose.
- **Open source** — inspect, modify, and extend the code under AGPL-3.0.
- **Your brand** — give affiliates a branded application page and dashboard.
- **Your data** — affiliate records, clicks, conversions, and settings stay in your PostgreSQL database.
- **Your payment provider** — connect the billing system you already use.
- **No platform fee** — TakeSlice does not take a percentage of affiliate commissions.
- **No npm install** — the tracking script is served directly by your TakeSlice instance.

You manage the business. TakeSlice manages the affiliate program.

## How It Works

Imagine you run a SaaS product called Acme and want creators and partners to recommend it.

### 1. Install and configure

Run TakeSlice on your infrastructure, point a domain such as `affiliates.acme.com` at it, and complete the four-step setup wizard: business details, admin account, program rules, and email.

### 2. Affiliates apply

Prospective partners visit `/partners`, create an account, verify their email, and submit an application with your custom questions and terms.

You review applications from the admin dashboard and approve, reject, suspend, or reactivate affiliates.

### 3. Approved affiliates share links

Approved affiliates get a dashboard with a unique referral link:

```text
https://affiliates.acme.com/r/alex123
```

The link redirects to your product and carries a TakeSlice click ID. Affiliates can also be assigned coupon codes when coupons are enabled.

### 4. TakeSlice records the click and conversion

The first-party tracking script stores the click ID and decorates Stripe Payment Links with `client_reference_id`. Your checkout, backend, or a supported payment-provider webhook sends the conversion back to TakeSlice.

TakeSlice checks the click, mode, attribution window, currency, and coupon rules, then records an immutable conversion and attribution outcome.

### 5. Commission to payout

Every credited live sale gets a pending commission with the rate, currency, and validation end frozen at attribution time. A background worker moves it through validation and the holding period, making it available for payout. Refunds and chargebacks reduce, decline, or reverse the commission; after a payout they create a negative adjustment instead of rewriting paid history.

You create a payout for available items, transfer the money externally, and mark it paid with a reference. The affiliate sees the payout in their earnings page and receives an email.

## Features Available Today

### Setup and administration

- Four-step first-run wizard with a one-time, rate-limited setup token.
- One instance per business. Roles are `admin` and `affiliate`.
- Program settings: name, public slug, currency, commission defaults, attribution window, validation period, holding period, recurring mode, approval mode, coupon mode, and minimum payout.
- Branding: logo, brand color, program description, and optional white-label mode.
- SMTP settings with a test email and a development outbox.
- Custom application questions.
- Admin audit log.
- API key management with live and test modes.
- AI Setup prompt generator for Cursor, Claude Code, Codex and other coding agents.

### Affiliates and applications

- Public program page and application portal.
- Email verification and password reset.
- Application review with approve, reject, suspend, and reactivate actions.
- Manual affiliate creation.
- Affiliate detail pages, internal notes, commission overrides, payout details, and balance.
- Affiliate dashboard with referral links, channel links with UTM parameters, coupons, and an earnings page.

### Links, coupons, and tracking

- Unique referral links with destination, label, UTM, and sub parameters.
- Coupon codes per affiliate, with optional Stripe promotion-code sync.
- `GET /r/{code}` click redirects with first-party click IDs.
- First-party `takeslice.js` tracking script served by the application.
- Click API for custom storefronts.
- Conversion API with Bearer API keys, test mode, idempotency, and explicit attribution outcomes.
- Attribution outcomes for valid clicks, unknown clicks, expired clicks, wrong mode, and currency mismatch, plus coupon fallback rules.

### Commissions and refunds

- Percentage or fixed commissions, frozen at attribution time.
- Per-affiliate rate overrides.
- Recurring commission modes: first payment, a bounded number of months, or lifetime.
- Validation and holding periods with a PostgreSQL-backed worker.
- Explicit lifecycle: pending, approved, available, paid, declined, reversed.
- Append-only commission history, ledger entries, and audit records.
- Admin decline and reverse actions with a required reason.
- Idempotent refunds and chargebacks, including partial refunds, full refunds, and refunds after payout. Stripe subscription refunds are matched through the invoice; other providers rely on the refund API unless their signed refund events are listed below.
- Fraud protection is limited to the validation and holding periods, manual decline and reverse, and refund clawback. There is no automatic self-referral or click-fraud detection yet.
- Refund API for any provider flow that does not deliver signed refund events.

### Payouts

- Manual payouts only: TakeSlice records the transfer, it does not move money itself. There is no CSV export or bulk payout yet.
- Available-balance calculation with active adjustments.
- Payout items reserve commissions and adjustments so nothing can be paid twice.
- Mark paid with a reference, or cancel to release the reserved items.
- Affiliate payout details stored encrypted with AES-256-GCM.
- Partner payout history and lifecycle explanation.
- Email and in-app notifications when a commission becomes available and when a payout is sent.

### Payment-provider webhooks

- Eight provider adapters behind one signed, deduplicated ingest contract.
- Encrypted provider credentials and signing secrets.
- Stripe webhook endpoint creation when `APP_URL` is a public HTTPS address.
- Provider event log with processed, ignored, deferred, and duplicate outcomes.
- Raw-body signature verification, timestamp tolerance where the provider supplies a timestamp, and a 1 MB payload cap.
- Stripe promotion-code creation when a coupon has a discount percentage and Stripe is connected in live mode.
- Stripe refund and dispute events connected to the commission lifecycle.

### Payment Provider Integrations

| Provider | Webhook events | Notes |
|---|---|---|
| Stripe | `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`, `charge.refunded`, `charge.dispute.created` | Automatic webhook creation, coupon sync, refunds and chargebacks. |
| Paddle | `transaction.completed` | Recurring transactions are marked as renewals. |
| Lemon Squeezy | `order_created`, `subscription_payment_success` | Subscription payments are marked as renewals. |
| Dodo Payments | `payment.succeeded`, `subscription.renewed` | Standard Webhooks signature format. |
| Polar | `order.paid` | Standard Webhooks signature format. |
| RevenueCat | `INITIAL_PURCHASE`, `RENEWAL`, `NON_RENEWING_PURCHASE` | Bearer secret verification. |
| Shopify | `orders/paid` | Reads `tscid` from note attributes or `landing_site`. |
| WooCommerce | `order.created`, `order.updated` | Records paid orders only. |

All adapters verify provider signatures and deduplicate deliveries. Only Stripe currently maps signed refund and chargeback events; for other providers use `POST /api/v1/refunds` from your backend. Detailed setup, signature, click-parameter, and troubleshooting notes are in [docs/providers.md](docs/providers.md).

## Roadmap

The core loop is implemented. Remaining work, in priority order:

- **Next:** integration diagnostics with a test event workflow, embedded Refer & Earn widget and signed embed tokens, customer referral registration API for apps without a full partner account, provider refund events beyond Stripe, reporting with date ranges and CSV export.
- **Later:** automatic affiliate coupon assignment, scheduled autopay or Stripe Connect, additional admin seats and roles, multi-currency, creative library, outbound webhooks and a documented OpenAPI schema, email template editing, i18n, fraud scoring.
- **Not planned for the core release:** affiliate marketplace or partner discovery, AI prospecting, cloud licensing, telemetry, or any dependency on the hosted TakeSlice product.

Not yet implemented: overview charts and period reports, CSV export, automatic payouts, multi-currency, embedded iframe widget, customer referral API, and automatic coupon assignment. The worker handles commission maturity and queued email; it does not run provider reconciliation.

---

## Quick Start

TakeSlice runs with Docker Compose. You do not need to publish or install an npm package.

### Requirements

- Docker Engine with Compose v2
- A server or local machine able to run Docker
- A domain and HTTPS reverse proxy for public deployments

### 1. Clone the repository

```bash
git clone https://github.com/takeslice/takeslice-selfhosted.git
cd takeslice-selfhosted
```

### 2. Generate the environment

```bash
./scripts/init-env.sh
```

Pass your public URL to set `APP_URL` at the same time:

```bash
./scripts/init-env.sh https://affiliates.example.com
```

The script refuses to overwrite an existing `.env`. It generates:

- a random PostgreSQL password
- a 32-byte `BETTER_AUTH_SECRET`
- a 32-byte `ENCRYPTION_KEY` used for provider credentials, SMTP passwords, and payout details

Keep `.env` and the `app-data` volume together. Losing `ENCRYPTION_KEY` makes stored provider credentials and payout details unreadable.

If you prefer to write `.env` yourself, copy `.env.example` and fill in every value. Compose refuses to start while `POSTGRES_PASSWORD` is empty.

Do not deploy with an example or shared database password.

### 3. Start TakeSlice

```bash
docker compose up -d --build
```

Compose starts PostgreSQL, runs migrations, and starts the application and worker containers.

### 4. Complete setup

Open:

```text
http://localhost:3000/setup
```

If `SETUP_TOKEN` is empty in `.env`, TakeSlice generates a one-time token when the setup page is first opened and prints it to the application log:

```bash
docker compose logs app | grep -i "enter this token"
```

If you set `SETUP_TOKEN` yourself, use that value instead.

The wizard creates the admin account and the initial program settings. After setup, sign in at `/login` and configure payment providers under **Providers**.

> **Configure SMTP before inviting partners.** Partner sign-up and password reset send a 6-digit code by email. Until you add SMTP settings under **Settings > Email**, partners cannot verify their address and sign-up will tell them the instance cannot send email. The email step in the wizard can be skipped, so check this before you launch.
>
> **Back up `ENCRYPTION_KEY`.** Provider credentials, webhook secrets, the SMTP password and affiliate payout details are encrypted with it. If the key is lost or changed they cannot be recovered. Keep `.env` and the `app-data` volume together in your backups.
>
> **Behind a reverse proxy**, set `TRUST_PROXY=true` (and `APP_URL` to your `https://` address). Without it every visitor shares one rate-limit bucket, which can drop clicks during a traffic spike.

### 5. Connect your product

Add the tracking script to the pages where referral links can land:

```html
<script src="https://affiliates.yourcompany.com/takeslice.js" defer></script>
```

The script forwards `tscid` from the URL, stores the click ID in a first-party cookie, and exposes `window.TakeSlice.clickId()` and `window.TakeSlice.decorate(url)` for custom checkouts.

For server-side conversion tracking, create an API key under **Settings → API keys** and send conversions from your backend:

```bash
curl -X POST https://affiliates.yourcompany.com/api/v1/conversions \
  -H "Authorization: Bearer ts_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "externalId": "order_123",
    "amountMinor": 4900,
    "currency": "EUR",
    "clickId": "clk_..."
  }'
```

`amountMinor` is an integer in the currency's smallest unit. API keys are secrets and must only be used from trusted server code.

Report a refund with the same API key:

```bash
curl -X POST https://affiliates.yourcompany.com/api/v1/refunds \
  -H "Authorization: Bearer ts_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "commissionId": "com_...",
    "refundId": "refund_123",
    "amountMinor": 4900,
    "currency": "EUR"
  }'
```

Repeating a `refundId` is safe and returns `duplicate: true`.

Alternatively, connect a supported payment provider under **Providers** and use its signed webhooks. Provider delivery URLs are shown on the provider page.

Start with **test mode** for a new connection, complete a test purchase, and confirm the event appears under **Providers → Events** and the commission appears under **Commissions** with a Test badge. Test commissions never create money.

## Integrate with AI

TakeSlice can generate an integration prompt for Cursor, Claude Code, Codex or another coding agent. The prompt is built locally in your instance from the instance URL, the provider you select and the integration pieces you enable. No source code or prompt is sent to an AI service.

1. Sign in to the dashboard as an administrator.
2. Open **Settings > AI Setup**.
3. Select the payment provider your application uses and the integration requirements.
4. Click **Copy prompt** and paste it into the coding agent.
5. Work through the verification checklist on the page. A connected provider is not the same as a verified integration.

The generated prompt tells the agent to inspect your authentication, signup, checkout and payment-provider flows before editing them. It uses the real endpoints in this release: `/r/{code}`, `/takeslice.js`, `window.TakeSlice`, `POST /api/v1/conversions` and `POST /api/v1/refunds`. It also states that this release has no embedded affiliate-dashboard, commission or payout API.

The prompt never includes API keys, provider signing secrets, database credentials, `ENCRYPTION_KEY` or the setup token. Do not add them after copying it.

If you want to start outside the dashboard, this starter prompt is safe to copy:

```text
You are integrating TakeSlice Self-Hosted into my existing application.

Read these public resources first:
- https://github.com/takeslice/takeslice-selfhosted
- https://github.com/takeslice/takeslice-selfhosted/blob/main/docs/ai-integration.md
- https://github.com/takeslice/takeslice-selfhosted/blob/main/docs/providers.md

Then inspect my application read-only and report how authentication, signup, checkout, payment confirmation and webhooks work. Do not edit anything yet. Do not ask me for API keys, signing secrets, database credentials or setup tokens. Wait for the tailored prompt from my TakeSlice instance.
```

The full guide, provider field matrix, verification checklist and troubleshooting are in [docs/ai-integration.md](docs/ai-integration.md).

---

## Production Deployment

Recommended setup:

- Linux server with Docker and Docker Compose
- Public domain with HTTPS through Caddy, Traefik, or nginx
- Persistent PostgreSQL and application-data volumes
- Strong database credentials
- Regular, tested backups

Set:

```env
APP_URL=https://affiliates.yourcompany.com
TRUST_PROXY=true
# Optional: the proxy's own CIDR, so only its forwarded hops are trusted.
TRUSTED_PROXY_CIDRS=127.0.0.1/32,::1/128,172.18.0.0/16
```

Only enable `TRUST_PROXY` when the app is behind a properly configured trusted reverse proxy that appends the client address to `X-Forwarded-For`. `TRUSTED_PROXY_CIDRS` defaults to loopback and private ranges and should be narrowed to the proxy's actual network. Do not expose PostgreSQL publicly.

### Volumes

The Compose project is named `takeslice`, so the named volumes are:

- `takeslice_db-data` — PostgreSQL data
- `takeslice_app-data` — uploads and generated application secrets

Back up both. A database dump alone is not enough: `app-data` contains the encryption key used for provider credentials, SMTP passwords, and payout details.

### Health

```http
GET /api/health
```

Returns `200` when the database is reachable and `503` when it is degraded. The Compose services use this endpoint for health checks.

### Updating

```bash
git pull
docker compose up -d --build
```

Migrations run before the application starts. For production, review changes, back up the database and `app-data`, and prefer a tested release tag over tracking `main`.

---

## Local Development

```bash
pnpm install
cp .env.example .env
```

Point `DATABASE_URL` at a local PostgreSQL instance and set `BETTER_AUTH_SECRET` and `ENCRYPTION_KEY`. For Compose, database settings come from `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB`; for local development, edit `DATABASE_URL` directly.

```bash
pnpm db:migrate
pnpm dev
```

Before committing:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Run tests:

```bash
pnpm test
pnpm test:e2e
```

The end-to-end suite needs a running instance plus `DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ENCRYPTION_KEY`. Tests that need provider fixtures also need `ENCRYPTION_KEY`; the affiliate flow reads queued email from `EMAIL_OUTBOX_DIR`. See [docs/development.md](docs/development.md) for the full test environment, the worker, and debugging notes.

| Component | Technology |
|---|---|
| Framework | Next.js App Router |
| Language | TypeScript |
| UI | React, Tailwind CSS, shadcn/ui |
| Database | PostgreSQL 17 |
| ORM | Drizzle |
| Authentication | Better Auth |
| Background jobs | PostgreSQL-backed worker |
| Deployment | Docker Compose |

Background jobs use PostgreSQL locking with `FOR UPDATE SKIP LOCKED`, so no Redis instance is required. The worker matures commissions and delivers queued email.

---

## Security Notes

- Provider credentials, SMTP passwords, and payout details are encrypted with AES-256-GCM.
- Webhook signatures are verified against the raw request body in constant time.
- Webhook payloads are capped at 1 MB.
- Admin and affiliate actions are authorized server-side; client-side hiding is never authorization.
- Setup, authentication, webhook, and refund endpoints are rate-limited.
- Uploaded images are validated and re-encoded; SVG uploads are rejected.
- CSP, HSTS, nosniff, frame denial, referrer, and permissions-policy headers are set by the application.
- Commission history, the ledger, and the audit log are append-only.

Report suspected vulnerabilities privately rather than opening a public issue. See [SECURITY.md](SECURITY.md).

---

## Frequently Asked Questions

### Is TakeSlice free?

The self-hosted software is free under AGPL-3.0-only. You pay for your own infrastructure and payment-provider charges.

### Does TakeSlice take a percentage of sales?

No. The self-hosted edition does not charge a platform commission. You configure the commissions paid to your affiliates.

### Do I need a TakeSlice Cloud account?

No. The self-hosted application is independent of the hosted TakeSlice product.

### Can affiliates sign up themselves?

Yes. They can apply through `/partners`, and you approve or decline applications from the dashboard.

### Do I need to replace my payment provider?

No. Connect a supported provider through signed webhooks, or send conversions from your backend through the API.

### Does TakeSlice pay affiliates automatically?

No. Payouts are manual: TakeSlice calculates the available balance, reserves the items in a payout, and records the external transfer when you mark it paid. Automatic payouts are on the roadmap.

### Is it production ready?

Yes for a controlled single-business deployment. The core loop has been audited end to end: setup, attribution, commission maturity, refunds, manual payouts, authorization, webhook verification and idempotency all pass against a real PostgreSQL database.

Two caveats before handling live money:

- Only Stripe has been tested against a real payment-provider sandbox. The other seven adapters are verified against recorded fixtures and signature contracts, so run a test-mode transaction with your own provider first.
- Reporting and CSV export, embedded referrals and non-Stripe refund webhooks are not implemented yet; see the [Roadmap](#roadmap).

Run a full test-mode cycle, back up your data, configure HTTPS and email, and review [SECURITY.md](SECURITY.md) before switching to live mode.

### Can I customize the source?

Yes, subject to AGPL-3.0-only.

---

## Contributing

Contributions are welcome: bug fixes, documentation, provider improvements, and feature work. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

[Issues](https://github.com/takeslice/takeslice-selfhosted/issues) · [Pull requests](https://github.com/takeslice/takeslice-selfhosted/pulls)

## License

TakeSlice Self-Hosted is licensed under **AGPL-3.0-only**. See [LICENSE](LICENSE).

---

**TakeSlice Self-Hosted**

*Build your business. Own your affiliate program.*

[Website](https://takeslice.com) · [GitHub](https://github.com/takeslice/takeslice-selfhosted)
