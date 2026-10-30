# Contributing to TakeSlice Self-Hosted

Thanks for helping improve the project. This guide covers local setup, tests, and the standards a pull request is expected to meet.

## Before you start

- Open an issue for anything larger than a bug fix or documentation change, so the approach can be agreed first.
- Do not copy code from the hosted TakeSlice product or other proprietary dependencies. This repository is AGPL-3.0-only and every contribution must be compatible with that license.
- Never commit real secrets, production data, customer records, payment credentials, or provider keys.

## Development setup

Requirements: Node.js 22+, pnpm 10, PostgreSQL 17.

```bash
pnpm install
cp .env.example .env
```

Set `DATABASE_URL` to a local PostgreSQL database and generate the two secrets:

```bash
openssl rand -base64 32   # BETTER_AUTH_SECRET
openssl rand -base64 32   # ENCRYPTION_KEY
```

Apply migrations and start the app:

```bash
pnpm db:migrate
pnpm dev
```

The setup wizard is at `/setup`. For local development you can set `SETUP_TOKEN` in `.env` instead of reading the generated token from the logs.

## Checks

Run these before opening a pull request:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

The end-to-end suite runs against a real instance and PostgreSQL:

```bash
pnpm test:e2e
```

For E2E runs, provide `DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ENCRYPTION_KEY`. The server under test must use the same database and, for the affiliate flow, the same `EMAIL_OUTBOX_DIR`. See [docs/development.md](docs/development.md) for the full environment, spec ordering, and worker notes.

## Code conventions

- TypeScript strict mode. Validate untrusted input with Zod at the boundary.
- Keep money in integer minor units. Never use floating-point arithmetic for authoritative amounts.
- Keep server authorization explicit; hiding a control in the UI is not authorization.
- Reuse existing feature modules, components, schemas, and data-access patterns rather than adding a competing implementation.
- Handle loading, empty, error, and partial states for every data-driven screen.
- Follow the existing file layout: `features/<domain>/{constants,rules,schemas,components,server,actions}.ts`.
- Prefer small focused modules and functions. Explain non-obvious decisions in a comment, not every line.

## Database changes

Edit the Drizzle schema under `src/lib/db/schema/`, then generate a migration:

```bash
pnpm db:generate
```

Commit the generated SQL and snapshot files. Migrations must be safe on an existing database and must not rewrite financial history. Add or update tests for any lifecycle, ledger, refund, or payout change.

## Provider changes

Each provider adapter must:

- Verify signatures against the raw request body with a timing-safe comparison and a timestamp tolerance.
- Normalize events into the shared fact union instead of branching deep inside the ingest route.
- Deduplicate deliveries by provider event ID.
- Treat refunds, chargebacks, renewals, and unknown early events explicitly.
- Include fixture tests for valid, invalid-signature, and duplicate deliveries.

Document setup steps and known limitations in `docs/providers.md`.

## Pull requests

- Keep the change focused; split unrelated refactors into separate PRs.
- Describe the problem, the approach, and what you tested. Include screenshots for visible UI changes.
- Add tests for new behaviour and regressions.
- Update documentation when commands, configuration, or user-visible behaviour changes.
- Use short conventional commit subjects, for example `fix: reject expired webhook timestamps`.

## Reporting security issues

Do not open a public issue. Follow [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contribution is licensed under AGPL-3.0-only, the same license as this repository.
