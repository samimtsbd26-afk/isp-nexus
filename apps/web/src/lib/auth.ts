import { trpcDeserializeResultData, trpcSerializeWire } from "./trpc-http";

const ACCESS_TOKEN_KEY = "isp_access_token";
const AUTH_EVENT = "isp-auth-state";
const CHUNK_RELOAD_KEY = "isp_chunk_retry";

let refreshPromise: Promise<string | null> | null = null;

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setAccessToken(token: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export function clearAccessToken(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export function subscribeAuthState(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === ACCESS_TOKEN_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(AUTH_EVENT, listener);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(AUTH_EVENT, listener);
  };
}

export async function restoreSession(force = false): Promise<string | null> {
  const current = getAccessToken();
  if (current && !force) return current;
  if (refreshPromise) return refreshPromise;

  refreshPromise = fetch("/api/trpc/auth.refresh", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: trpcSerializeWire(undefined),
  })
    .then(async (response) => {
      const body = await response.json().catch(() => null);
      const token =
        body?.result?.data !== undefined ? trpcDeserializeResultData<{ accessToken?: string }>(body.result.data).accessToken : undefined;
      if (!response.ok || !token) {
        clearAccessToken();
        return null;
      }
      setAccessToken(token);
      return token;
    })
    .catch(() => {
      clearAccessToken();
      return null;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const requestInit: RequestInit = { ...init, headers, credentials: "include" };
  const response = await fetch(input, requestInit);
  const url = String(input);
  if (response.status !== 401 || url.includes("auth.refresh") || url.includes("auth.login")) return response;

  const refreshed = await restoreSession(true);
  if (!refreshed) return response;

  const retryHeaders = new Headers(init?.headers);
  retryHeaders.set("Authorization", `Bearer ${refreshed}`);
  return fetch(input, { ...init, headers: retryHeaders, credentials: "include" });
}

function isChunkLoadError(reason: unknown): boolean {
  const message = reason instanceof Error ? reason.message : String(reason ?? "");
  return /Loading chunk|ChunkLoadError|dynamically imported module|module script failed|Failed to fetch/i.test(message);
}

export function installChunkLoadRetry(): void {
  if (typeof window === "undefined") return;
  const reload = (reason: unknown) => {
    if (!isChunkLoadError(reason)) return;
    const last = sessionStorage.getItem(CHUNK_RELOAD_KEY);
    const now = Date.now();
    if (last && now - Number(last) < 30_000) return;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
    window.location.reload();
  };
  window.addEventListener("error", (event) => reload(event.error ?? event.message));
  window.addEventListener("unhandledrejection", (event) => reload(event.reason));
}
