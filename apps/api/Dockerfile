FROM node:22-alpine AS deps
RUN npm install -g pnpm@9
WORKDIR /app
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/portal/package.json ./apps/portal/
RUN pnpm install --no-frozen-lockfile

FROM node:22-alpine AS runner
RUN npm install -g tsx && addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY --from=deps --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=deps --chown=appuser:appgroup /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps --chown=appuser:appgroup /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps --chown=appuser:appgroup /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --chown=appuser:appgroup packages/db/src ./packages/db/src
COPY --chown=appuser:appgroup packages/db/package.json ./packages/db/
COPY --chown=appuser:appgroup packages/shared/src ./packages/shared/src
COPY --chown=appuser:appgroup packages/shared/package.json ./packages/shared/
COPY --chown=appuser:appgroup apps/api/src ./apps/api/src
COPY --chown=appuser:appgroup apps/api/package.json ./apps/api/
USER appuser
EXPOSE 3001
WORKDIR /app/apps/api
CMD ["tsx", "src/boot.ts"]
