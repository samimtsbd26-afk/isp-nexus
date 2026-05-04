FROM node:22-alpine
RUN npm install -g pnpm@9
WORKDIR /app
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/portal/package.json ./apps/portal/
RUN pnpm install --no-frozen-lockfile
COPY packages/ ./packages/
CMD ["sh", "-c", "yes '' | pnpm --filter @isp-nexus/db db:push"]
