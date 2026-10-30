# TakeSlice Self-Hosted

**Your affiliate program. Your infrastructure. Your rules.**

TakeSlice is an open-source, self-hosted affiliate management platform for SaaS businesses and online products. Run your own affiliate program, review applications, issue referral links and coupon codes, track attributed sales, and keep every record in your own database.

No marketplace. No platform fee. No shared tenancy. No npm package or cloud account required.

[Quick start](#quick-start) · [Features](#features-available-today) · [Integrations](#payment-provider-integrations) · [Roadmap](#roadmap) · [GitHub](https://github.com/takeslice/takeslice-selfhosted)

Licensed under AGPL-3.0-only.

> **Project status:** early development. Setup, affiliate management, tracking, conversion ingestion, and provider webhooks are implemented. Commission calculation, refunds, payouts, and reporting are the next milestones. See [Roadmap](#roadmap) before using this in production.

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

### 5. Track performance

The dashboard shows affiliates, applications, coupons, provider deliveries, and recent activity. Commission calculation, validation periods, refunds, and payouts are being built in the next milestones.

## Features Available Today

### Setup and administration

- Four-step first-run wizard with a one-time, rate-limited setup token.
- One instance per business. Roles are `admin` and `affiliate`.
- Program settings: name, public slug, currency, commission defaults, attribution window, validation period, approval mode, coupon mode, and minimum payout.
- Branding: logo, brand color, program description, and optional white-label mode.
- SMTP settings with a test email and a development outbox.
- Custom application questions.
- Admin audit log.
- API key management with live and test modes.

### Affiliates and applications

- Public program page and application portal.
- Email verification and password reset.
- Application review with approve, reject, suspend, and reactivate actions.
- Manual affiliate creation.
- Affiliate detail pages and internal notes.
- Affiliate dashboard with referral links.

### Links, coupons, and tracking

- Unique referral links with destination, label, UTM, and sub parameters.
- Coupon codes per affiliate, with optional Stripe promotion-code sync.
- `GET /r/{code}` click redirects with first-party click IDs.
- First-party `takeslice.js` tracking script served by the application.
- Click API for custom storefronts.
- Conversion API with Bearer API keys, test mode, idempotency, and explicit attribution outcomes.
- Attribution outcomes for valid clicks, unknown clicks, expired clicks, wrong mode, currency mismatch, and coupon conflicts.

### Payment-provider webhooks

- Eight provider adapters behind one signed, deduplicated ingest contract.
- Encrypted provider credentials and signing secrets.
- Stripe webhook endpoint creation when `APP_URL` is a public HTTPS address.
- Provider event log with processed, ignored, deferred, and duplicate outcomes.
- Raw-body signature verification, timestamp tolerance, and a 1 MB payload cap.
- Stripe promotion-code creation when a coupon has a discount percentage and Stripe is connected in live mode.

### Payment Provider Integrations

| Provider | Webhook events | Notes |
|---|---|---|
| Stripe | `checkout.session.completed`, `invoice.paid` | Automatic webhook creation and coupon sync. |
| Paddle | `transaction.completed` | Recurring transactions are marked as renewals. |
| Lemon Squeezy | `order_created`, `subscription_payment_success` | Subscription payments are marked as renewals. |
| Dodo Payments | `payment.succeeded`, `subscription.renewed` | Standard Webhooks signature format. |
| Polar | `order.paid` | Standard Webhooks signature format. |
| RevenueCat | `INITIAL_PURCHASE`, `RENEWAL`, `NON_RENEWING_PURCHASE` | Bearer secret verification. |
| Shopify | `orders/paid` | Reads `tscid` from note attributes or `landing_site`. |
| WooCommerce | `order.created`, `order.updated` | Records paid orders only. |

All adapters verify provider signatures and deduplicate deliveries. Refund and chargeback handling is not yet connected to commissions. Detailed setup, signature, click-parameter, and troubleshooting notes are in [docs/providers.md](docs/providers.md).

## Roadmap

The core loop is being built in milestones:

- **Done:** project scaffold, Docker deployment, setup wizard, authentication, admin settings, affiliate portal and applications, referral links, coupons, click tracking, conversion API, attribution, eight provider webhooks, event log.
- **Next:** commission calculation and overrides, validation and holding periods, recurring commissions, refunds and chargebacks, adjustments, commission status history, ledger.
- **Then:** affiliate balances, manual payouts, overview metrics and charts, CSV export.
- **Release:** security hardening, full end-to-end coverage, accessibility and responsive pass, operations documentation, clean-clone Docker test.

Not yet implemented: commission records, payout records, performance reports, automatic affiliate coupon assignment, email notification jobs beyond authentication and setup email, and scheduled background jobs. The worker container currently provides the queue loop and database health check.

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

### 2. Configure the environment

```bash
cp .env.example .env
```

Set at minimum:

```env
POSTGRES_PASSWORD=replace-with-a-long-random-password
APP_URL=http://localhost:3000
```

For a public deployment, `APP_URL` must be the public HTTPS address, for example `https://affiliates.yourcompany.com`. Leave `BETTER_AUTH_SECRET` and `ENCRYPTION_KEY` empty to have them generated into the persistent `app-data` volume on first boot, or provide your own 32-byte base64 values.

Do not deploy with the example database password.

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

Alternatively, connect a supported payment provider under **Providers** and use its signed webhooks. Provider delivery URLs are shown on the provider page.

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
```

Only enable `TRUST_PROXY` when the app is behind a properly configured trusted reverse proxy. Forward the original host and client IP headers, and do not expose PostgreSQL publicly.

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

Point `DATABASE_URL` at a local PostgreSQL instance. For Compose, database settings come from `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB`; for local development, edit `DATABASE_URL` directly.

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

Background jobs use PostgreSQL locking with `FOR UPDATE SKIP LOCKED`, so no Redis instance is required. Job handlers arrive with the commission milestone.

---

## Security Notes

- Provider credentials and SMTP passwords are encrypted with AES-256-GCM.
- Webhook signatures are verified against the raw request body in constant time.
- Webhook payloads are capped at 1 MB.
- Admin and affiliate actions are authorized server-side; client-side hiding is never authorization.
- Setup and authentication endpoints are rate-limited.
- Uploaded images are validated and re-encoded; SVG uploads are rejected.

Report suspected vulnerabilities privately rather than opening a public issue.

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

### Is it production ready?

Not yet. The tracking and provider layer is usable, but commission calculation, refunds, and payouts are still in progress. Treat the current release as an early preview.

### Can I customize the source?

Yes, subject to AGPL-3.0-only.

---

## Contributing

Contributions are welcome: bug fixes, documentation, provider improvements, and feature work. Open an issue or submit a pull request.

[Issues](https://github.com/takeslice/takeslice-selfhosted/issues) · [Pull requests](https://github.com/takeslice/takeslice-selfhosted/pulls)

## License

TakeSlice Self-Hosted is licensed under **AGPL-3.0-only**. See [LICENSE](LICENSE).

---

**TakeSlice Self-Hosted**

*Build your business. Own your affiliate program.*

[Website](https://takeslice.com) · [GitHub](https://github.com/takeslice/takeslice-selfhosted)
