import { test as base } from "@playwright/test";
import { connectToTestDatabase } from "./db";

export const test = base.extend<{ resetRateLimits: void }>({
  resetRateLimits: [
    async ({}, use) => {
      const sql = connectToTestDatabase();
      if (sql) {
        await sql`delete from rate_limit`;
        await sql.end();
      }
      await use();
    },
    { auto: true },
  ],
});
