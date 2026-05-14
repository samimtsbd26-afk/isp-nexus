FROM node:22-alpine
WORKDIR /app
COPY apps/db-migrator/migrate.mjs ./migrator/migrate.mjs
COPY apps/db-migrator/mark-drizzle-ledger.mjs ./migrator/mark-drizzle-ledger.mjs
COPY packages/db/migrations ./packages/db/migrations
RUN cd migrator && npm init -y && npm install postgres
CMD ["sh", "-c", "node migrator/migrate.mjs && node migrator/mark-drizzle-ledger.mjs"]
