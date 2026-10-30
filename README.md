# TakeSlice Self-Hosted

Open-source affiliate management you run on your own server. Your business, your data, your
payment-provider keys. No marketplace, no platform fee, no shared database.

## Quick start

```bash
git clone <repository> takeslice-selfhosted
cd takeslice-selfhosted
cp .env.example .env
docker compose up -d
```

Open `http://localhost:3000`. The first-run wizard is protected by a one-time setup token:

```bash
docker compose logs app | grep -i setup
```

In production, put the app behind a reverse proxy that terminates HTTPS (Caddy, Traefik or
nginx) and set `APP_URL` to the public address. Set `TRUST_PROXY=true` once the proxy is in front.

## What it does

- First-run wizard: business details, admin account, program rules, SMTP, first provider.
- Admin dashboard: affiliates, applications, commission rules, payouts, reports.
- Public affiliate portal with a branded application page and affiliate dashboard.
- Referral links, coupons, click tracking, UTM support and per-link performance.
- Payment-provider integrations: Stripe, Paddle, Lemon Squeezy, Dodo, Polar, RevenueCat,
  Shopify, WooCommerce.
- Commission lifecycle: pending, approved, available, paid, declined, reversed. Manual payouts
  recorded with a reference and an audit trail.

## Development

```bash
pnpm install
cp .env.example .env      # point DATABASE_URL at a local Postgres
pnpm db:migrate
pnpm dev
```

Before committing:

```bash
pnpm typecheck && pnpm lint && pnpm build
```

## Architecture

- Next.js App Router, React, TypeScript, Tailwind CSS, shadcn/ui.
- PostgreSQL 17 with Drizzle ORM and committed SQL migrations.
- Better Auth with database sessions and verified email.
- A worker container processes jobs with `FOR UPDATE SKIP LOCKED`; no Redis required.
- One instance is one business. Roles are `admin` and `affiliate`.

## Operations

- Health: `GET /api/health` returns 200 when the database is reachable, 503 otherwise.
- Backups: back up the Postgres volume and the `app-data` volume (uploads and generated secrets).
- Upgrades: pull the new image, `docker compose up -d`; migrations run before the app starts.

## License

AGPL-3.0-only. See [LICENSE](LICENSE).
