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
# Patch node-routeros to handle MikroTik v7 !empty reply
RUN node -e "const fs=require('fs'); const p='/app/node_modules/.pnpm/node-routeros@1.6.9/node_modules/node-routeros/dist/Channel.js'; let c=fs.readFileSync(p,'utf8'); const o=\"            case '!done':\\n                if (!this.trapped)\\n                    this.emit('done', this.data);\\n                this.close();\\n                break;\\n            default:\"; const n=\"            case '!done':\\n                if (!this.trapped)\\n                    this.emit('done', this.data);\\n                this.close();\\n                break;\\n            case '!empty':\\n                // MikroTik v7 sends !empty before !done for empty responses - ignore\\n                break;\\n            default:\"; if(c.includes(o)){ c=c.replace(o,n); fs.writeFileSync(p,c); console.log('patched'); } else { console.log('patch skip'); }"
# Patch Receiver to ignore data for already-closed tags (prevents UNREGISTEREDTAG crash)
RUN node -e "const fs=require('fs'); const p='/app/node_modules/.pnpm/node-routeros@1.6.9/node_modules/node-routeros/dist/connector/Receiver.js'; let c=fs.readFileSync(p,'utf8'); const o='        else {\\n            throw new RosException_1.RosException(\\'UNREGISTEREDTAG\\');\\n        }'; const n='        else {\\n            // Ignore data for already-closed tags\\n            return;\\n        }'; if(c.includes(o)){ c=c.replace(o,n); fs.writeFileSync(p,c); console.log('patched receiver'); } else { console.log('patch skip receiver'); }"

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
COPY --chown=appuser:appgroup apps/hotspot ./apps/hotspot
USER appuser
EXPOSE 3001
WORKDIR /app/apps/api
CMD ["tsx", "src/boot.ts"]
