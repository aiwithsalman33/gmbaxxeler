FROM node:22-bookworm-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/ai/package.json packages/ai/
COPY packages/contracts/package.json packages/contracts/
COPY packages/core/package.json packages/core/
COPY packages/crypto/package.json packages/crypto/
COPY packages/db/package.json packages/db/
COPY packages/gbp/package.json packages/gbp/
COPY packages/notify/package.json packages/notify/
COPY packages/services/package.json packages/services/
COPY packages/storage/package.json packages/storage/
RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm rebuild prisma @prisma/client @prisma/engines esbuild

FROM deps AS build
COPY . .
RUN pnpm --filter @localpilot/web build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
USER node
CMD ["node", "apps/web/server.js"]
