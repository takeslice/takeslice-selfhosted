/**
 * Background worker. Claims due jobs from the `job` table with FOR UPDATE SKIP LOCKED.
 * Job handlers arrive with the commission milestone; until then the loop only reports
 * that it is alive so operators can see the container is healthy.
 */
import { setTimeout as sleep } from "node:timers/promises";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const POLL_INTERVAL_MS = 5_000;
const sql = postgres(url, { max: 2, onnotice: () => {} });

console.log("Worker started.");

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopping = true;
  });
}

while (!stopping) {
  try {
    await sql`select 1`;
  } catch (error) {
    console.error("Worker database check failed:", error instanceof Error ? error.message : error);
  }
  await sleep(POLL_INTERVAL_MS);
}

await sql.end();
console.log("Worker stopped.");
