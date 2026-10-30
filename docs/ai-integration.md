# Integrate TakeSlice with an AI coding agent

TakeSlice Self-Hosted can generate an integration prompt for Cursor, Claude Code, Codex, Windsurf or any other coding agent. The prompt is built locally from your instance URL, the payment provider you select and the integration pieces you need. It uses the endpoints and browser helpers that exist in the source code for this release.

> **Secrets never belong in the prompt.** TakeSlice sends no source code, prompt or instance data to an AI service. Do not paste an API key, provider signing secret, database URL, `ENCRYPTION_KEY` or setup token into a coding agent, a repository, a screenshot or an issue.

## Generate the prompt

1. Sign in to the TakeSlice dashboard as an administrator.
2. Open **Settings > AI Setup**.
3. Select the payment provider your application uses and the integration pieces you need.
4. Click **Copy prompt** and paste it into your coding agent.
5. Run the verification checklist in step 3 of the page.

The generator is wired to the provider adapters in this repository. Only adapters that exist appear in the list. If your checkout is not supported by one of them, choose **Custom checkout (API only)**.

The AI Setup page is not a setup wizard. It does not connect a provider, create an API key or prove that a conversion was tracked. Those remain manual steps.

## What the prompt covers

Every generated prompt includes:

- A read-only inspection phase for authentication, signup, checkout creation, payment confirmation, subscription renewals and refunds.
- The instance URL, GitHub repository, provider reference and this guide.
- The selected provider's real click-ID and coupon field names.
- The selected provider's supported webhook events and connection status.
- The first-party tracking script, click redirect and public `window.TakeSlice` helpers when browser tracking is enabled.
- The conversion and refund APIs when server-side conversion or refunds are enabled.
- A verification checklist for referral clicks, checkout attribution, test payments, duplicate delivery and existing checkout behaviour.
- An explicit list of what the developer must still configure manually.
- An explicit statement that this release has no embedded affiliate-dashboard, commission or payout API.

## What an agent can automate

- Finding the existing auth, signup, checkout and payment-provider code.
- Adding `/takeslice.js` to the correct layout or landing pages.
- Reading a click ID with `window.TakeSlice.clickId()` and passing it into the existing checkout path.
- Adding provider metadata fields without changing pricing or fulfilment.
- Calling `POST /api/v1/conversions` from trusted server code when a provider webhook does not cover the flow.
- Calling `POST /api/v1/refunds` for providers that do not send signed refund events.
- Adding tests for click capture, checkout metadata, duplicate delivery and the existing checkout.
- Writing down the manual steps that remain.

## What you must do manually

- Connect the payment provider in **Dashboard > Providers**, choose live or test mode and paste the signing secret into TakeSlice. Never put it in application source code.
- Create a TakeSlice API key in **Dashboard > Settings > API keys** if the server-side conversion or refund API is used. Store it in a server-side secret manager.
- Add the exact webhook URL in the provider dashboard. Get it from **Dashboard > Providers**; do not guess the connection ID.
- Run a real test-mode checkout in the provider dashboard.
- Confirm the program website and allowed origin match the application domain.
- Review money, tax, fulfilment and refund behaviour before switching to live mode.

## Integration surface in this release

| Capability | Status | Where |
|---|---|---|
| Referral redirect and click recording | Available | `GET /r/{code}` |
| First-party tracking script | Available | `GET /takeslice.js` |
| Browser helpers | Available | `window.TakeSlice.version`, `clickId()`, `decorate(url)` |
| Signed provider webhooks | Available | `POST /api/webhooks/{provider}/{connectionId}` |
| Conversion API | Available, Bearer API key | `POST /api/v1/conversions` |
| Refund API | Available, Bearer API key | `POST /api/v1/refunds` |
| Embedded affiliate dashboard API | Not available | Use the dashboard pages |
| Commission API | Not available | Use the dashboard pages |
| Payout API | Not available | Use the dashboard pages |

The conversion API uses `externalId` as its per-mode idempotency key. The refund API uses `refundId` as its idempotency key. Both accept integer minor units; `currency` is an optional three-letter code that defaults to the program currency on conversions and is required on refunds. Test mode never creates payable money.

## Provider-specific fields

The generated prompt contains the exact field names for the selected adapter. For reference:

| Provider | Click ID | Coupon | Webhook events |
|---|---|---|---|
| Stripe | `client_reference_id`, then metadata `tscid` | metadata `ts_coupon_code` | `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`, `charge.refunded`, `charge.dispute.created` |
| Paddle | `custom_data.tscid` | `custom_data.ts_coupon_code` | `transaction.completed` |
| Lemon Squeezy | `meta.custom_data.tscid` | `meta.custom_data.ts_coupon_code` | `order_created`, `subscription_payment_success` |
| Dodo Payments | `data.metadata.tscid` | `data.metadata.ts_coupon_code` | `payment.succeeded`, `subscription.renewed` |
| Polar | `data.metadata.tscid` | `data.metadata.ts_coupon_code` | `order.paid` |
| RevenueCat | subscriber attribute `tscid`, then `app_user_id` | subscriber attribute `ts_coupon_code` | `INITIAL_PURCHASE`, `RENEWAL`, `NON_RENEWING_PURCHASE` |
| Shopify | note attribute `tscid`, then `landing_site` | discount codes | `orders/paid` |
| WooCommerce | `meta_data` key `tscid` | `coupon_lines` | `order.updated`, `order.created` |

Stripe records the first subscription payment from the checkout session and ignores the first `invoice.paid` with `billing_reason=subscription_create`. Later `subscription_cycle` invoices are renewals.

The Shopify adapter records paid orders as purchases only. Renewals are not offered for Shopify.

See [Payment Providers](./providers.md) for signature rules, setup and troubleshooting.

## Verification checklist

Run these checks against the running instance. Do not treat any step as passed until you have evidence for it.

1. Open an affiliate referral link and confirm it redirects to the configured destination with a `tscid` value.
2. Land on a page that loads `/takeslice.js` and confirm `window.TakeSlice.clickId()` returns the click ID.
3. Complete a test checkout and confirm the provider event is processed under **Provider events**.
4. If the conversion API is enabled, send a server-side conversion and confirm the response includes an attribution outcome and conversion ID.
5. Confirm the attribution appears under **Commissions** with the expected affiliate and a Test badge in test mode.
6. Send the same conversion or webhook twice and confirm the second delivery is a duplicate with no second commission.
7. Confirm the existing checkout still charges once, fulfils once and does not depend on TakeSlice being reachable.
8. If refunds are enabled, refund the test payment and confirm the commission is reduced, declined or reversed exactly once.

## Troubleshooting

| Symptom | Check |
|---|---|
| Conversion saved but unattributed | The checkout did not include `tscid`, or no valid coupon was present. Check the field name for the selected provider. |
| `window.TakeSlice` is undefined | The script is not loaded on that page, or a content security policy blocked it. Confirm `/takeslice.js` returns JavaScript. |
| Webhook returns `401` | The signing secret belongs to another endpoint or mode. Re-copy it from the provider. |
| Webhook returns `404` | The connection is disconnected, the provider in the URL does not match, or the secret is missing. |
| Webhook returns `409` | TakeSlice is waiting for earlier data. The provider should retry; do not mark the integration complete. |
| Refund returns `404` | The commission ID is wrong or belongs to the other mode. Use the ID returned by the conversion API. |
| Refund returns `duplicate: true` | That `refundId` was already applied. Use a new ID for a new refund event. |
| Existing checkout broke | The integration must be additive. Revert the change and inspect the existing payment flow before retrying. |

## Starter prompt for the public repository

The dashboard generator is the recommended path because it knows your selected provider and connection status. If you are beginning outside the dashboard, this starter prompt points an agent at the public documentation:

```text
You are integrating TakeSlice Self-Hosted into my existing application.

First read these public resources:
- https://github.com/takeslice/takeslice-selfhosted
- https://github.com/takeslice/takeslice-selfhosted/blob/main/docs/ai-integration.md
- https://github.com/takeslice/takeslice-selfhosted/blob/main/docs/providers.md

Then inspect my application read-only and report:
1. How authentication and signup work.
2. Where checkout sessions are created and payments are confirmed.
3. Which payment provider SDK and webhook verification I use.
4. Which pages can receive referral traffic.
5. Where secrets are stored.

Do not edit anything yet. Do not ask me for API keys, signing secrets, database credentials or setup tokens. After reporting, wait for me to use the AI Setup page in my TakeSlice instance to generate the tailored prompt.
```
