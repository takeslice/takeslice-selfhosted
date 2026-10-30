# Payment Providers

TakeSlice connects to a payment provider through signed webhooks. Each connection verifies the provider's signature against the raw request body, normalizes the event, claims the provider event ID, and records a conversion when the event represents a paid sale.

Provider credentials and webhook secrets are encrypted with AES-256-GCM before they are stored. The UI only shows a short credential hint.

## Connection model

There is one connection per provider and mode:

| Mode | Use |
|---|---|
| Live | Real customers and real commissions. |
| Test | Provider test mode. Conversions are badged as test and never create money. |

Open **Dashboard → Providers** to connect one. The connection page shows the exact webhook URL and event list for that connection:

```text
{APP_URL}/api/webhooks/{provider}/{connectionId}
```

Stripe also accepts `/api/webhooks/stripe/{connectionId}`.

Only `active` connections accept deliveries. Disconnecting a provider leaves its historical events and conversions intact.

## Click attribution

A provider webhook must carry the TakeSlice click ID (`clk_…`) from the checkout. The key names differ by provider:

| Provider | Where TakeSlice reads the click ID | Coupon field |
|---|---|---|
| Stripe | `client_reference_id`, then metadata `tscid` | metadata `ts_coupon_code` |
| Paddle | `custom_data.tscid` | `custom_data.ts_coupon_code` |
| Lemon Squeezy | `meta.custom_data.tscid` | `meta.custom_data.ts_coupon_code` |
| Dodo Payments | `data.metadata.tscid` | `data.metadata.ts_coupon_code` |
| Polar | `data.metadata.tscid` | `data.metadata.ts_coupon_code` |
| RevenueCat | subscriber attribute `tscid`, then `app_user_id` | subscriber attribute `ts_coupon_code` |
| Shopify | note attributes `tscid`, then `landing_site` | discount codes |
| WooCommerce | `meta_data` key `tscid` | `coupon_lines` |

If there is no click ID, TakeSlice can attribute through a coupon code. If both are present, the program's attribution conflict rule decides which wins. Without either, the conversion is recorded as unattributed for audit purposes.

## Signature and delivery rules

| Provider | Signature check |
|---|---|
| Stripe | `Stripe-Signature: t=…,v1=…`; HMAC-SHA256 of `{t}.{rawBody}`; 5-minute tolerance. |
| Paddle | `Paddle-Signature: ts=…;h1=…`; HMAC-SHA256 of `{ts}:{rawBody}`; 5-minute tolerance. |
| Lemon Squeezy | `X-Signature`; hex HMAC-SHA256 of the raw body. |
| Dodo Payments | Standard Webhooks headers; signature over `{id}.{timestamp}.{body}`; 5-minute tolerance. |
| Polar | Standard Webhooks headers; signature over `{id}.{timestamp}.{body}`; 5-minute tolerance. |
| RevenueCat | `Authorization: Bearer <secret>` compared in constant time. |
| Shopify | `X-Shopify-Hmac-Sha256`; base64 HMAC-SHA256 of the raw body. Topic must be `orders/paid`. |
| WooCommerce | `X-WC-Webhook-Signature`; base64 HMAC-SHA256 of the raw body. Only paid order statuses are recorded. |

TakeSlice caps webhook bodies at 1 MB and records the delivery outcome in **Providers → Events**.

Responses:

| Status | Meaning |
|---|---|
| `200` | Processed, ignored, or an exact duplicate of an already recorded event. |
| `400` | The payload is invalid or the signature header is malformed. |
| `401` | The signature did not verify. |
| `404` | Unknown connection, wrong provider, disconnected connection, or missing secret. |
| `409` | The event was deferred because earlier data is required. The provider should retry. |
| `500` | Processing failed. The provider should retry. |
| `503` | The program is not configured yet. |

Deduplication uses the pair `(connection, provider_event_id)`. A provider redelivery is a no-op and returns the original conversion ID when one exists. Conversion creation also has its own dedupe key so a provider that changes event IDs cannot create the same sale twice.

## Provider setup

### Stripe

1. Add a secret key for the mode you are connecting. Test and live keys create separate connections.
2. When `APP_URL` is a public HTTPS address, TakeSlice creates a webhook endpoint for `checkout.session.completed` and `invoice.paid` and stores the returned signing secret.
3. For local development or a manually created endpoint, add the webhook in Stripe, then paste its `whsec_…` signing secret into TakeSlice instead.

The first-party tracking script decorates Stripe Payment Links and Checkout links with `client_reference_id`. For a custom checkout, set `client_reference_id` to `window.TakeSlice.clickId()` or copy the `tscid` value from the landing URL.

Stripe coupons:

- Add a coupon with a **discount percentage** and Stripe will be synced in live mode.
- TakeSlice creates a Stripe coupon with `duration=forever` and a promotion code matching the code.
- Deactivating the coupon in TakeSlice deactivates the Stripe promotion code.
- If sync fails, the coupon is still saved. The error is shown on the coupons page and can be retried with **Sync to Stripe**.
- Coupons without a percentage are attribution-only. Create the matching code in Stripe manually.

### Paddle

1. Create a notification destination for `transaction.completed`.
2. Paste its secret key in the format Paddle shows for the signature (`pdl_…` or the destination secret beginning with `pdl_…`).
3. Pass `tscid` in `custom_data` when creating the checkout.

Recurring transactions with origin `subscription_recurring` are marked as renewals.

### Lemon Squeezy

1. Add a webhook for `order_created` and `subscription_payment_success`.
2. Paste the signing secret shown by Lemon Squeezy.
3. Pass `tscid` inside `meta.custom_data`.

Subscription payment events and orders with `first_order: false` are marked as renewals.

### Dodo Payments

1. Add a Standard Webhooks endpoint for `payment.succeeded` and `subscription.renewed`.
2. Paste the `whsec_…` secret.
3. Put `tscid` in the payment metadata.

Only Standard Webhooks signatures are accepted. Timestamps older than five minutes are rejected.

### Polar

1. Add a Standard Webhooks endpoint for `order.paid`.
2. Paste the `whsec_…` secret.
3. Put `tscid` in the order metadata.

Orders with `billing_reason: subscription_cycle` are marked as renewals.

### RevenueCat

1. Create a webhook in RevenueCat.
2. Set an `Authorization` header to a long random value and paste the same value into TakeSlice. The form stores the raw value; TakeSlice sends and expects `Bearer <value>`.
3. Set the subscriber attribute `tscid`, or pass the click ID as `app_user_id`.
4. Supported events: `INITIAL_PURCHASE`, `RENEWAL`, `NON_RENEWING_PURCHASE`.

RevenueCat amounts are decimal prices and are converted to integer minor units.

### Shopify

1. Create an `orders/paid` webhook.
2. Paste the webhook signing secret.
3. Add the click ID as a note attribute named `tscid`, or preserve the `tscid` query parameter in `landing_site`.

Discount codes are used for coupon attribution when no click ID is present.

### WooCommerce

1. Create an `order.updated` webhook. `order.created` is also accepted.
2. Paste the webhook secret.
3. Put `tscid` in the order metadata.

Only `processing` and `completed` orders are recorded. `date_created_gmt` is treated as UTC.

## Test mode

Use the provider's test mode and a test connection. Test conversions are stored with `mode = test`, are visibly badged, and do not create commission money.

When sending a click through `/r/{code}`, append `?ts_mode=test` so the click itself is also test mode. A live webhook cannot attribute to a test click, and a test webhook cannot attribute to a live click.

## Testing a connection

Use the provider's dashboard to send a test event, or send a signed fixture from a trusted server. A successful delivery appears in **Providers → Events** as `Processed`.

To verify rejection, resend the same body with a modified signature. TakeSlice returns `401` and does not create a conversion.

To verify idempotency, resend an already accepted event unchanged. TakeSlice returns `200` with `duplicate: true` and the original conversion ID.

## Troubleshooting

| Symptom | Check |
|---|---|
| `404` from the webhook URL | The connection is disconnected, the provider in the URL does not match, or the secret is missing. Reconnect the provider. |
| `401` | The pasted signing secret belongs to a different webhook endpoint or mode. Re-copy it from the provider. |
| `400` invalid payload | The provider event does not contain an amount, currency, time, and transaction ID, or the event is malformed. |
| Conversion recorded but unattributed | The checkout did not include `tscid`, and no valid coupon was present. Check the provider-specific field in the click attribution table. |
| `503` | Complete the program setup wizard before sending webhooks. |
| Stripe webhook was not created | `APP_URL` must be public HTTPS. For localhost, create the Stripe endpoint manually and paste its signing secret. |
| Stripe coupon sync failed | Confirm the live Stripe connection is active and the secret key can manage coupons and promotion codes. Retry from the coupons page. |

Never put provider secrets in client-side code, screenshots, logs, or issue reports. Revoke and replace a secret if it is exposed.
