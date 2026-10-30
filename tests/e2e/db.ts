import postgres from "postgres";

/**
 * E2E-only database access for fixtures that cannot be created through the UI.
 * Authentication rate limiting is shared per IP, and a full suite signs in more
 * often than a person would, so the limiter is cleared before each test.
 */
export function connectToTestDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return postgres(url, { max: 1, onnotice: () => {} });
}
