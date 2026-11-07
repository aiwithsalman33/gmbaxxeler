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
RUN pnpm db:generate
RUN pnpm --filter @localpilot/worker build

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/worker/dist ./apps/worker/dist
COPY --from=build /app/apps/worker/package.json ./apps/worker/package.json
USER node
CMD ["node", "apps/worker/dist/index.js"]
