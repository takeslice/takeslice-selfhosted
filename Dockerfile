# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build-time placeholders: Next imports server modules while compiling. Runtime values come from the environment.
ENV SKIP_ENV_VALIDATION=1 \
    DATABASE_URL=postgres://build:build@localhost:5432/build \
    APP_URL=http://localhost:3000 \
    BETTER_AUTH_SECRET=build-only-placeholder-secret-value-000000
RUN pnpm build

# Migration image: full node_modules plus committed SQL migrations.
FROM base AS migrator
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY drizzle ./drizzle
COPY scripts ./scripts
ENTRYPOINT ["sh", "scripts/entrypoint.sh"]
CMD ["node", "scripts/migrate.mjs"]

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/app/data
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/drizzle ./drizzle
RUN mkdir -p /app/data/uploads && chown -R app:app /app/data
USER app
EXPOSE 3000
ENTRYPOINT ["sh", "scripts/entrypoint.sh"]
CMD ["node", "server.js"]
