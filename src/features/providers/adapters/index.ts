import type { ProviderAdapter, ProviderId } from "../types";
import { dodoAdapter } from "./dodo";
import { lemonSqueezyAdapter } from "./lemonsqueezy";
import { paddleAdapter } from "./paddle";
import { polarAdapter } from "./polar";
import { revenueCatAdapter } from "./revenuecat";
import { shopifyAdapter } from "./shopify";
import { stripeAdapter } from "./stripe";
import { wooCommerceAdapter } from "./woocommerce";

const ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  stripe: stripeAdapter,
  paddle: paddleAdapter,
  lemonsqueezy: lemonSqueezyAdapter,
  dodo: dodoAdapter,
  polar: polarAdapter,
  revenuecat: revenueCatAdapter,
  shopify: shopifyAdapter,
  woocommerce: wooCommerceAdapter,
};

export function adapterFor(provider: ProviderId): ProviderAdapter {
  return ADAPTERS[provider];
}
