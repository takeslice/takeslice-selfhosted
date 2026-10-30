import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

const MAX_CONNECTIONS = 10;
const IDLE_TIMEOUT_SECONDS = 20;
const CONNECT_TIMEOUT_SECONDS = 10;

export type Database = ReturnType<typeof createDatabase>;

/** Creates a Drizzle client over postgres.js. Prefer the shared `db` export in app code. */
export function createDatabase(url: string) {
  const sql = postgres(url, {
    max: MAX_CONNECTIONS,
    idle_timeout: IDLE_TIMEOUT_SECONDS,
    connect_timeout: CONNECT_TIMEOUT_SECONDS,
    prepare: false,
  });
  return Object.assign(drizzle(sql, { schema, casing: "snake_case" }), { $sql: sql });
}

const globalForDb = globalThis as unknown as { db?: Database };

/** One pool per process: dev hot reload must not leak connections. */
export const db = globalForDb.db ?? createDatabase(env.DATABASE_URL);

if (env.NODE_ENV !== "production") globalForDb.db = db;
