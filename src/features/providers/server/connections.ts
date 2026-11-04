import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { auditLog, providerConnection } from "@/lib/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";
import { newId } from "@/lib/ids";
import { providerInfo } from "../constants";
import type { ActiveConnection, ProviderId, ProviderMode, StoredCredentials } from "../types";
import type { ProviderConnectionInput } from "../schemas";
import { createStripeWebhook, deleteStripeWebhook, stripeKeyMode, validateStripeKey } from "./stripe";

export interface ProviderConnectionRow {
  id: string;
  provider: ProviderId;
  mode: ProviderMode;
  status: "pending" | "active" | "disconnected";
  credentialHint: string | null;
  remoteWebhookId: string | null;
  lastEventAt: Date | null;
  lastError: string | null;
  createdAt: Date;
}

export type ConnectionResult = { ok: true; id: string; message: string } | { ok: false; error: string };

const MIN_WEBHOOK_SECRET_LENGTH = 8;

export function webhookUrl(provider: ProviderId, connectionId: string): string {
  return `${env.APP_URL}/api/webhooks/${provider}/${connectionId}`;
}

export async function listProviderConnections(): Promise<ProviderConnectionRow[]> {
  return db
    .select({
      id: providerConnection.id,
      provider: providerConnection.provider,
      mode: providerConnection.mode,
      status: providerConnection.status,
      credentialHint: providerConnection.credentialHint,
      remoteWebhookId: providerConnection.remoteWebhookId,
      lastEventAt: providerConnection.lastEventAt,
      lastError: providerConnection.lastError,
      createdAt: providerConnection.createdAt,
    })
    .from(providerConnection)
    .orderBy(providerConnection.provider, providerConnection.mode);
}

export async function getProviderConnection(id: string): Promise<ActiveConnection | null> {
  const [row] = await db.select().from(providerConnection).where(eq(providerConnection.id, id)).limit(1);
  if (!row) return null;
  const credentials = parseCredentials(decryptSecret(row.credentialsEncrypted));
  const webhookSecret = row.webhookSecretEncrypted ? decryptSecret(row.webhookSecretEncrypted) : "";
  return {
    id: row.id,
    provider: row.provider,
    mode: row.mode,
    status: row.status,
    credentials,
    webhookSecret,
    remoteWebhookId: row.remoteWebhookId,
  };
}

export async function getActiveProviderConnection(provider: ProviderId, mode: ProviderMode): Promise<ActiveConnection | null> {
  const [row] = await db
    .select({ id: providerConnection.id })
    .from(providerConnection)
    .where(and(eq(providerConnection.provider, provider), eq(providerConnection.mode, mode), eq(providerConnection.status, "active")))
    .limit(1);
  return row ? getProviderConnection(row.id) : null;
}

export async function saveProviderConnection(input: ProviderConnectionInput, actorUserId: string): Promise<ConnectionResult> {
  if (input.provider === "stripe") return saveStripeConnection(input, actorUserId);

  if (!input.webhookSecret || input.webhookSecret.length < MIN_WEBHOOK_SECRET_LENGTH) {
    return { ok: false, error: "Paste the webhook signing secret from the provider. It must be at least 8 characters." };
  }

  const [existing] = await db
    .select({ id: providerConnection.id })
    .from(providerConnection)
    .where(and(eq(providerConnection.provider, input.provider), eq(providerConnection.mode, input.mode)))
    .limit(1);
  const id = existing?.id ?? newId("pcx");
  await upsertConnection({
    id,
    provider: input.provider,
    mode: input.mode,
    status: "active",
    credential: input.credential,
    webhookSecret: input.webhookSecret,
    remoteWebhookId: null,
    lastError: null,
    actorUserId,
  });

  return {
    ok: true,
    id,
    message: `${providerInfo(input.provider).label} is connected. Send a test webhook to confirm the signature.`,
  };
}

async function saveStripeConnection(input: ProviderConnectionInput, actorUserId: string): Promise<ConnectionResult> {
  if (!input.credential) return { ok: false, error: "Add your Stripe secret key so TakeSlice can verify the account and create the webhook." };

  const keyMode = stripeKeyMode(input.credential);
  if (!keyMode) {
    return { ok: false, error: "That does not look like a Stripe secret or restricted key. Use an sk_ or rk_ key." };
  }
  if (keyMode !== input.mode) {
    return {
      ok: false,
      error: `This is a ${keyMode} key, but the connection is set to ${input.mode} mode. Use a ${input.mode} key or switch the connection mode.`,
    };
  }

  try {
    await validateStripeKey(input.credential);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Stripe rejected the secret key." };
  }

  const [existing] = await db
    .select({ id: providerConnection.id, remoteWebhookId: providerConnection.remoteWebhookId })
    .from(providerConnection)
    .where(and(eq(providerConnection.provider, "stripe"), eq(providerConnection.mode, input.mode)))
    .limit(1);
  const id = existing?.id ?? newId("pcx");

  if (!input.webhookSecret && !isPublicHttpsUrl(env.APP_URL)) {
    return {
      ok: false,
      error: "Stripe needs a public HTTPS address to create the webhook. Set APP_URL to your HTTPS domain, or create the endpoint in Stripe and paste its signing secret.",
    };
  }

  // Never downgrade a working connection before the replacement exists: a failed reconnect must
  // leave the previous webhook secret in place, or live events would 404 and Stripe would
  // eventually disable the endpoint.
  if (input.webhookSecret) {
    await upsertConnection({
      id,
      provider: "stripe",
      mode: input.mode,
      status: "active",
      credential: input.credential,
      webhookSecret: input.webhookSecret,
      remoteWebhookId: existing?.remoteWebhookId ?? null,
      lastError: null,
      actorUserId,
    });
    return { ok: true, id, message: "Stripe is connected with the signing secret you pasted." };
  }

  let created: { id: string; secret: string };
  try {
    created = await createStripeWebhook(input.credential, webhookUrl("stripe", id), providerInfo("stripe").webhookEvents);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stripe's webhook could not be created.";
    if (existing) await db.update(providerConnection).set({ lastError: message }).where(eq(providerConnection.id, id));
    return { ok: false, error: message };
  }

  try {
    await upsertConnection({
      id,
      provider: "stripe",
      mode: input.mode,
      status: "active",
      credential: input.credential,
      webhookSecret: created.secret,
      remoteWebhookId: created.id,
      lastError: null,
      actorUserId,
    });
  } catch (error) {
    // The new endpoint is not recorded anywhere, so remove it instead of orphaning it.
    await deleteStripeWebhook(input.credential, created.id);
    console.error("[providers] could not save the Stripe connection", error);
    return { ok: false, error: "Stripe's webhook was created but the connection could not be saved. Try again." };
  }
  if (existing?.remoteWebhookId) await deleteStripeWebhook(input.credential, existing.remoteWebhookId);
  return { ok: true, id, message: "Stripe is connected. The webhook endpoint was created automatically." };
}

interface UpsertInput {
  id: string;
  provider: ProviderId;
  mode: ProviderMode;
  status: "pending" | "active";
  credential: string;
  webhookSecret: string | null;
  remoteWebhookId: string | null;
  lastError: string | null;
  actorUserId: string;
}

async function upsertConnection(input: UpsertInput): Promise<void> {
  const credentials: StoredCredentials = { credential: input.credential || undefined };
  const credentialHint = input.credential ? maskCredential(input.credential) : null;
  await db.transaction(async (tx) => {
    await tx
      .insert(providerConnection)
      .values({
        id: input.id,
        provider: input.provider,
        mode: input.mode,
        status: input.status,
        credentialsEncrypted: encryptSecret(JSON.stringify(credentials)),
        webhookSecretEncrypted: input.webhookSecret ? encryptSecret(input.webhookSecret) : null,
        credentialHint,
        remoteWebhookId: input.remoteWebhookId,
        lastError: input.lastError,
      })
      .onConflictDoUpdate({
        target: [providerConnection.provider, providerConnection.mode],
        set: {
          status: input.status,
          credentialsEncrypted: encryptSecret(JSON.stringify(credentials)),
          webhookSecretEncrypted: input.webhookSecret ? encryptSecret(input.webhookSecret) : null,
          credentialHint,
          remoteWebhookId: input.remoteWebhookId,
          lastError: input.lastError,
        },
      });
    await tx.insert(auditLog).values({
      id: newId("aud"),
      actorUserId: input.actorUserId,
      action: "provider.connected",
      targetType: "provider_connection",
      targetId: input.id,
      metadata: { provider: input.provider, mode: input.mode },
    });
  });
}

export async function disconnectProviderConnection(id: string, actorUserId: string): Promise<ConnectionResult> {
  const connection = await getProviderConnection(id);
  if (!connection) return { ok: false, error: "That connection no longer exists." };
  await db.update(providerConnection).set({ status: "disconnected" }).where(eq(providerConnection.id, id));
  if (connection.provider === "stripe" && connection.credentials.credential && connection.remoteWebhookId) {
    await deleteStripeWebhook(connection.credentials.credential, connection.remoteWebhookId);
  }
  await db.insert(auditLog).values({
    id: newId("aud"),
    actorUserId,
    action: "provider.disconnected",
    targetType: "provider_connection",
    targetId: id,
    metadata: { provider: connection.provider, mode: connection.mode },
  });
  return { ok: true, id, message: `${providerInfo(connection.provider).label} is disconnected.` };
}

export async function recordProviderDelivery(connectionId: string, error: string | null = null): Promise<void> {
  await db.update(providerConnection).set({ lastEventAt: new Date(), lastError: error }).where(eq(providerConnection.id, connectionId));
}

function parseCredentials(value: string): StoredCredentials {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as StoredCredentials) : {};
  } catch {
    return {};
  }
}

function maskCredential(value: string): string {
  if (value.length <= 8) return "saved";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function isPublicHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1";
  } catch {
    return false;
  }
}
