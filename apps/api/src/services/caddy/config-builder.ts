import { eq, and, asc } from "drizzle-orm";
import { virtualHosts } from "@isp-nexus/db";
import type { Db, VirtualHost } from "@isp-nexus/db";
import { env } from "../../lib/env.js";

type CaddyRoute = Record<string, unknown>;

function reverseProxyHandler(dial: string): Record<string, unknown> {
  return { handler: "reverse_proxy", upstreams: [{ dial }] };
}

function apiProxyRoute(upstream: string): CaddyRoute {
  return {
    match: [{ path: ["/api/*"] }],
    handle: [reverseProxyHandler(upstream)],
  };
}

function socketProxyRoute(upstream: string): CaddyRoute {
  return {
    match: [
      {
        path: ["/socket.io/*"],
        header: { Connection: ["*Upgrade*"], Upgrade: ["websocket"] },
      },
    ],
    handle: [reverseProxyHandler(upstream)],
  };
}

function socketHttpFallbackRoute(upstream: string): CaddyRoute {
  return {
    match: [{ path: ["/socket.io/*"] }],
    handle: [reverseProxyHandler(upstream)],
  };
}

function securityHeadersHandler(): Record<string, unknown> {
  return {
    handler: "headers",
    response: {
      set: {
        "Strict-Transport-Security": ["max-age=31536000; includeSubDomains"],
        "X-Content-Type-Options": ["nosniff"],
        "X-Frame-Options": ["SAMEORIGIN"],
        "X-XSS-Protection": ["1; mode=block"],
        "Referrer-Policy": ["strict-origin-when-cross-origin"],
      },
    },
  };
}

function buildSubroutes(vh: VirtualHost): CaddyRoute[] {
  const apiUpstream = vh.apiUpstream ?? "api:3001";
  const routes: CaddyRoute[] = [];

  if (vh.hasApiProxy) routes.push(apiProxyRoute(apiUpstream));

  if (vh.hasSocketProxy) {
    routes.push(socketProxyRoute(apiUpstream));
    routes.push(socketHttpFallbackRoute(apiUpstream));
  }

  if (vh.staticRoot) {
    // Serve static files; if the file doesn't exist rewrite to fallback
    if (vh.staticFallback) {
      routes.push({
        match: [{ not: [{ file: { root: vh.staticRoot, try_files: ["{http.request.uri.path}"] } }] }],
        handle: [{ handler: "rewrite", uri: `/${vh.staticFallback}` }],
      });
    }
    routes.push({
      handle: [
        { handler: "vars", root: vh.staticRoot },
        { handler: "file_server" },
      ],
    });
  } else if (vh.primaryUpstream) {
    routes.push({ handle: [reverseProxyHandler(vh.primaryUpstream)] });
  }

  return routes;
}

function buildVhostRoute(vh: VirtualHost): CaddyRoute {
  const handlersStack: Record<string, unknown>[] = [];

  if (vh.gzipEnabled) handlersStack.push({ handler: "encode", encodings: { gzip: {} } });
  if (vh.securityHeaders) handlersStack.push(securityHeadersHandler());
  if (vh.cacheControl) {
    handlersStack.push({
      handler: "headers",
      response: { set: { "Cache-Control": [vh.cacheControl] } },
    });
  }

  const subroutes = buildSubroutes(vh);
  if (subroutes.length > 0) {
    handlersStack.push({ handler: "subroute", routes: subroutes });
  }

  const isHttpOnly = vh.listenHttp || vh.domain.startsWith(":");

  return {
    match: isHttpOnly ? undefined : [{ host: [vh.domain] }],
    handle: handlersStack,
    terminal: true,
  };
}

export async function buildCaddyConfig(db: Db, orgId: string): Promise<Record<string, unknown>> {
  const hosts = await db
    .select()
    .from(virtualHosts)
    .where(and(eq(virtualHosts.orgId, orgId), eq(virtualHosts.isEnabled, true)))
    .orderBy(asc(virtualHosts.sortOrder));

  const httpsRoutes: CaddyRoute[] = [];
  const httpRoutes: CaddyRoute[] = [];

  for (const vh of hosts) {
    const route = buildVhostRoute(vh);
    if (vh.listenHttp || vh.domain.startsWith(":")) {
      httpRoutes.push(route);
    } else {
      httpsRoutes.push(route);
    }
  }

  const servers: Record<string, unknown> = {};

  if (httpsRoutes.length > 0) {
    servers["https"] = {
      listen: [":443"],
      routes: httpsRoutes,
    };
  }

  if (httpRoutes.length > 0) {
    servers["http"] = {
      listen: [":80"],
      routes: httpRoutes,
    };
  }

  return {
    admin: { listen: "0.0.0.0:2019" },
    apps: {
      http: { servers },
      tls: {
        automation: {
          policies: [
            {
              issuers: [
                {
                  module: "acme",
                  email: env.SSL_EMAIL ?? "admin@skynity.org",
                },
              ],
            },
          ],
        },
      },
    },
  };
}
