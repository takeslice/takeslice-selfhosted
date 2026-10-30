# Security Policy

TakeSlice Self-Hosted handles affiliate identity, conversion records, commission balances, payout details, and payment-provider credentials. Please report suspected vulnerabilities privately.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting on the repository:

1. Open the **Security** tab.
2. Choose **Report a vulnerability**.
3. Include affected version or commit, reproduction steps, impact, and any suggested fix.

Do not open a public issue for a suspected vulnerability, and do not include live secrets, customer data, or payment credentials in a report. If you need to demonstrate a credential leak, use a revoked test key.

You should receive an acknowledgement within a few business days. Please allow time for a fix and coordinated disclosure before publishing details.

## Supported versions

The project is an early preview and has no stable release yet. Security fixes are applied to `main`. If you deploy a fork or a tagged build, track upstream changes and apply relevant fixes yourself.

## Scope

In scope:

- Authentication, session handling, and authorization bypasses
- Cross-tenant or cross-affiliate data exposure (this product is single-tenant, so “tenant” means the instance and its affiliates)
- Webhook signature verification bypass, replay, or deduplication failures
- Commission, refund, balance, ledger, or payout manipulation
- SQL injection, XSS, CSRF, SSRF, path traversal, and unsafe file upload handling
- Secret disclosure through logs, errors, responses, exports, or caches
- Setup-token bypass or instance takeover during first run
- Denial-of-service issues that require no authentication

Out of scope:

- Findings that require a compromised admin account or server access
- Missing hardening headers that the project already sets intentionally
- Reports from automated scanners without a demonstrated impact
- Social engineering, physical access, or third-party provider outages
- Issues in dependencies that have no reachable path in this application (still welcome as informational reports)

## Deployment responsibilities

The operator is responsible for the host, network, database, backups, reverse proxy, TLS, and provider accounts. At minimum:

- Use a unique, strong `POSTGRES_PASSWORD` and keep PostgreSQL off the public internet.
- Keep `APP_URL` on HTTPS for any public deployment.
- Back up both the database and the `app-data` volume, which contains the encryption key for provider credentials and payout details.
- Restrict access to `docker compose logs`, `.env`, and the Docker socket.
- Review admin accounts and API keys, and revoke keys that may have leaked.
- Enable `TRUST_PROXY` only behind a trusted reverse proxy that appends the client address to `X-Forwarded-For`, and keep `TRUSTED_PROXY_CIDRS` limited to that proxy's network. Never expose the app directly while `TRUST_PROXY` is enabled.

## Known limitations

These are documented product limitations, not vulnerabilities:

- There is one admin role and no multi-factor authentication in the current release. Protect the admin account with a strong unique password and restrict network access to the dashboard where possible.
- Payouts are manual attestations. TakeSlice records the reference you enter; it cannot prove an external bank transfer occurred.
- Payout details are encrypted at rest but visible to admins by design.
- Stripe is the only provider whose signed refund and chargeback events are mapped today. Other providers should call the refund API.
- Commission and payout state changes are audited, but the operator remains responsible for reconciling them against the payment provider.

## Safe harbor

We will not pursue legal action against researchers who:

- Test only against their own deployment or a test instance they are authorized to use
- Avoid accessing, modifying, or exfiltrating other people's data
- Stop testing and report promptly after discovering a vulnerability
- Give us reasonable time to fix the issue before public disclosure

This safe harbor does not authorize testing against TakeSlice-operated infrastructure or any third party without permission.
