# syntax=docker/dockerfile:1.4
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

FROM deps AS builder
WORKDIR /app
COPY packages/db/src ./packages/db/src
COPY packages/db/tsconfig.json ./packages/db/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/src ./packages/shared/src
COPY packages/shared/tsconfig.json ./packages/shared/
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/src ./apps/api/src
COPY apps/api/tsconfig.json ./apps/api/
COPY apps/api/package.json ./apps/api/
RUN pnpm exec tsc -p packages/db && \
    pnpm exec tsc -p packages/shared && \
    pnpm exec tsc -p apps/api
# Node ESM requires explicit .js extensions for relative imports in emitted files
RUN node <<'NODE'
const fs = require("fs");
const path = require("path");
function patchFile(file) {
  let c = fs.readFileSync(file, "utf8");
  const re = /\b(from|import)\s+["'](\.[^"']+)["']/g;
  c = c.replace(re, (m, kw, spec) => {
    if (spec.endsWith(".js") || spec.endsWith(".json") || spec.includes("?")) return m;
    return `${kw} "${spec}.js"`;
  });
  fs.writeFileSync(file, c);
}
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".js")) patchFile(p);
  }
}
for (const root of ["/app/packages/db/dist", "/app/packages/shared/dist", "/app/apps/api/dist"]) {
  if (fs.existsSync(root)) walk(root);
}
NODE
# Node resolves workspace packages via package.json "exports" — point to compiled JS
RUN node <<'NODE'
const fs = require("fs");
const path = require("path");
const patches = [
  ["packages/db/package.json", {
    ".": "./dist/index.js",
    "./schema": "./dist/schema/index.js",
    "./schema/radius": "./dist/schema/radius.js",
    "./client": "./dist/client.js",
  }],
  ["packages/shared/package.json", {
    ".": "./dist/index.js",
    "./zod": "./dist/zod/index.js",
    "./types": "./dist/types/index.js",
  }],
];
for (const [rel, ex] of patches) {
  const p = path.join("/app", rel);
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  j.exports = ex;
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
}
NODE

FROM node:22-alpine AS runner
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY --from=deps --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=deps --chown=appuser:appgroup /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps --chown=appuser:appgroup /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps --chown=appuser:appgroup /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=builder --chown=appuser:appgroup /app/packages/db/dist ./packages/db/dist
COPY --from=builder --chown=appuser:appgroup /app/packages/db/package.json ./packages/db/package.json
COPY --from=builder --chown=appuser:appgroup /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=appuser:appgroup /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder --chown=appuser:appgroup /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=appuser:appgroup /app/apps/api/package.json ./apps/api/package.json
COPY --chown=appuser:appgroup apps/hotspot ./apps/hotspot
USER appuser
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/boot.js"]
