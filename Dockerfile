# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS base
RUN apk add --no-cache su-exec \
  && corepack enable \
  && addgroup -S app \
  && adduser -S app -G app
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build-time placeholders: Next imports server modules while compiling. Runtime values come from the environment.
ENV NEXT_TELEMETRY_DISABLED=1 \
    SKIP_ENV_VALIDATION=1 \
    DATABASE_URL=postgres://build:build@localhost:5432/build \
    APP_URL=http://localhost:3000 \
    BETTER_AUTH_SECRET=build-only-placeholder-secret-value-000000
RUN pnpm build

# Migrations and the worker share this image. The entrypoint drops root privileges
# after it has prepared the persisted data volume.
FROM base AS migrator
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY drizzle ./drizzle
COPY scripts ./scripts
COPY src ./src
ENTRYPOINT ["sh", "scripts/entrypoint.sh"]
CMD ["node", "scripts/migrate.mjs"]

FROM base AS runner
# Standalone Next binds to HOSTNAME, which Docker sets to the container ID. Listen
# on every interface so health checks and reverse proxies reach the server.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/app/data
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/drizzle ./drizzle
RUN mkdir -p /app/data/uploads \
  && chown -R app:app /app/data /app/.next
EXPOSE 3000
ENTRYPOINT ["sh", "scripts/entrypoint.sh"]
CMD ["node", "server.js"]
