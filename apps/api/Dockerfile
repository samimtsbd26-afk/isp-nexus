FROM node:22-alpine AS base
RUN npm install -g pnpm@9
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/portal/package.json ./apps/portal/
RUN pnpm install --no-frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .
RUN cd apps/api && pnpm exec tsc --skipLibCheck --noEmitOnError false

FROM node:22-alpine AS runner
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY --from=build --chown=appuser:appgroup /app/apps/api/dist ./dist
COPY --from=build --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=build --chown=appuser:appgroup /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=build --chown=appuser:appgroup /app/packages/shared/node_modules ./packages/shared/node_modules
# Workspace packages export .ts files — copy source so tsx loader can handle them at runtime
COPY --from=build --chown=appuser:appgroup /app/packages/db/src ./packages/db/src
COPY --from=build --chown=appuser:appgroup /app/packages/db/package.json ./packages/db/
COPY --from=build --chown=appuser:appgroup /app/packages/shared/src ./packages/shared/src
COPY --from=build --chown=appuser:appgroup /app/packages/shared/package.json ./packages/shared/
USER appuser
EXPOSE 3001
CMD ["node", "--import", "tsx/esm", "dist/boot.js"]
