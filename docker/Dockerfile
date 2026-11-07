# One build for all three services. Stages are shared, so a small server
# installs dependencies and runs prisma generate once, not three times.

FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

# Every dependency, shared by all builds.
FROM base AS deps
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

FROM deps AS source
COPY . .
RUN pnpm db:generate

FROM source AS server-build
RUN pnpm --filter @localpilot/api build
RUN pnpm --filter @localpilot/worker build

FROM source AS web-build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--max-old-space-size=1536
# CI type-checks, so a small server skips Next's own, slower pass.
ENV SKIP_NEXT_TYPECHECK=1
RUN pnpm --filter @localpilot/web build

# pnpm hoists every workspace package together, so the web app's packages are
# removed here. They add hundreds of MB and the API and worker never load them.
FROM deps AS server-deps
COPY packages/db/prisma packages/db/prisma
RUN rm -rf node_modules
RUN pnpm install --prod --frozen-lockfile --offline --ignore-scripts
RUN pnpm rebuild prisma @prisma/client @prisma/engines
RUN pnpm --filter @localpilot/db exec prisma generate
RUN cd node_modules && rm -rf next @next @img sharp react react-dom recharts lucide-react es-toolkit typescript @radix-ui @tanstack

FROM node:22-bookworm-slim AS server-runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=server-deps /app/node_modules ./node_modules

FROM server-runtime AS api
COPY --from=source /app/packages/db/prisma ./packages/db/prisma
COPY --from=source /app/docker/api-entrypoint.sh ./docker/api-entrypoint.sh
COPY --from=server-build /app/apps/api/dist ./apps/api/dist
COPY --from=server-build /app/apps/api/package.json ./apps/api/package.json
EXPOSE 4000
USER node
CMD ["sh", "docker/api-entrypoint.sh"]

FROM server-runtime AS worker
COPY --from=server-build /app/apps/worker/dist ./apps/worker/dist
COPY --from=server-build /app/apps/worker/package.json ./apps/worker/package.json
USER node
CMD ["node", "apps/worker/dist/index.js"]

FROM node:22-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=web-build /app/apps/web/.next/standalone ./
COPY --from=web-build /app/apps/web/.next/static ./apps/web/.next/static
EXPOSE 3000
USER node
CMD ["node", "apps/web/server.js"]
