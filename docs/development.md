# Development

How to run TakeSlice Self-Hosted locally, test it, and find your way around the code. For installing a production instance, follow the [README](../README.md). For provider details, see [providers.md](providers.md).

## Requirements

- Node.js 22 or newer
- pnpm 10
- PostgreSQL 17 (local, Docker, or a dedicated test database)

## Local setup

```bash
pnpm install
cp .env.example .env
```

In `.env`:

- Set `DATABASE_URL` to a database on your machine, for example `postgres://postgres:postgres@localhost:5432/takeslice_dev`.
- Generate `BETTER_AUTH_SECRET` and `ENCRYPTION_KEY` with `openssl rand -base64 32`. `ENCRYPTION_KEY` must decode to exactly 32 bytes.
- Set `APP_URL` to the URL you open in the browser, for example `http://localhost:3000`. Cookies and links use it.
- Optionally set `SETUP_TOKEN` to a value of at least 16 characters. Otherwise the app prints a generated token to the console.

Apply migrations and start the app:

```bash
pnpm db:migrate
pnpm dev
```

Open `/setup` and complete the wizard. After setup the wizard returns 404 and the admin signs in at `/login`; partners use `/partners`.

### Emails without SMTP

Set `EMAIL_OUTBOX_DIR=/tmp/takeslice-outbox`. TakeSlice writes each message as a JSON file in that directory instead of sending it. Verification codes, password resets, application updates, and payout notices all appear there. The admin email settings screen can also send a test message to the outbox.

### Background worker

Validation, holding-period maturity, and queued jobs run in `scripts/worker.ts`, not in the web process:

```bash
pnpm worker
```

For a single pass, used by tests, set `WORKER_ONCE=1`:

```bash
WORKER_ONCE=1 pnpm worker
```

Without the worker, commissions stay `pending` and jobs stay `queued`.

## Project layout

```text
src/app/            routes: dashboard, partners, setup, r/[code], takeslice.js, api/*
src/components/     shared UI (ui, states, dashboard shell, portal, brand)
src/features/       feature modules: schemas, server services, actions, components
src/lib/            db client, env, ids, money, crypto, rate limiting, safe fetch
drizzle/            committed SQL migrations and snapshots
scripts/            migrate, worker, Docker entrypoint, env initializer
tests/unit/         Vitest unit tests
tests/e2e/          Playwright specs against a real server and database
docs/               provider setup and development documentation
```

Feature modules follow one shape: `schemas.ts` validates input, `server/*.ts` holds database and provider logic, `actions.ts` authenticates, calls the service, and returns a result, and `components/` renders it. Business rules that do not need I/O live in `rules.ts` or `constants.ts` so they are unit-testable.

Money is always integer minor units with explicit currency. Authoritative amounts never use floating point. Commission and ledger history is append-only; corrections are new entries.

## Checks

Before opening a pull request:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

`pnpm test` runs Vitest and does not need a database. It covers rules, money math, schemas, adapters, and other pure logic.

## End-to-end tests

Playwright specs in `tests/e2e/` run against a real server and PostgreSQL. They create affiliates, send clicks and webhooks, run the worker, and inspect the database.

Build once, then start a server with a dedicated database and the outbox enabled:

```bash
pnpm build
```

```bash
DATABASE_URL=postgres://localhost:5432/takeslice_e2e \
APP_URL=http://localhost:3300 \
BETTER_AUTH_SECRET=... \
ENCRYPTION_KEY=... \
EMAIL_OUTBOX_DIR=/tmp/takeslice-e2e-outbox \
PORT=3300 pnpm start
```

Then run the suite with the same values:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3300 \
DATABASE_URL=postgres://localhost:5432/takeslice_e2e \
ENCRYPTION_KEY=... \
ADMIN_EMAIL=admin@acme.example \
ADMIN_PASSWORD=correct-horse-1 \
EMAIL_OUTBOX_DIR=/tmp/takeslice-e2e-outbox \
pnpm test:e2e
```

Notes:

- The server and Playwright must use the same `EMAIL_OUTBOX_DIR`; the affiliate spec reads verification and payout messages from it.
- `DATABASE_URL` lets specs mature commissions and assert on stored rows. The database should already have a completed setup and an admin account matching `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
- `tests/e2e/setup.spec.ts` needs a fresh, unconfigured instance and `SETUP_TOKEN` matching that instance. Run it first against a separate database, or against a clean Docker stack. Do not run it against an instance that is already configured.
- Run specs with `--workers=1`. They share one database and program settings, so parallel runs interfere. In particular, the settings spec changes the commission rate for later tests.

## Docker development

```bash
docker compose build app worker
docker compose up -d
docker compose logs -f app
```

The stack runs migrations in a one-shot `migrate` service, then starts `app` and `worker`. The app is published on `${APP_PORT:-3000}`. A fresh volume produces an unconfigured instance; the setup token appears in the app logs:

```text
[setup] Open http://localhost:3000/setup and enter this token: ...
```

If setup is incomplete and the app restarts, the token rotates and is printed again. Set `SETUP_TOKEN` to pin it instead.

To start over from an empty database and empty data volume:

```bash
docker compose down -v
docker compose up -d
```

## Debugging

- **Webhook rejected**: check the delivery row under **Providers → Events** and the status table in [providers.md](providers.md). Signature errors are `401`, malformed payloads `400`, unknown or disconnected connections `404`.
- **Conversion arrived but is unattributed**: the checkout did not include `tscid`, and no valid coupon matched. See the click-attribution table in [providers.md](providers.md).
- **Commission never matures**: the worker is not running, or its validation or holding periods have not elapsed. Run `WORKER_ONCE=1 pnpm worker` to process due items immediately.
- **Emails missing**: verify `EMAIL_OUTBOX_DIR` is set for both the server and the worker, or that SMTP settings are saved and tested from the admin email screen.
- **Wrong origin in links or cookies**: `APP_URL` must match the URL in the browser, including scheme and port.

## Database changes

Edit the schema under `src/lib/db/schema/`, then:

```bash
pnpm db:generate
pnpm db:migrate
```

Commit the generated SQL and snapshot. Migrations must be safe on an existing database and must not rewrite settled financial history. Add tests for any change to commission, refund, adjustment, ledger, or payout behaviour.
