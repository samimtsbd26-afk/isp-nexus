// Module-level persistent stores — survive React component unmount/remount.
// Keyed by routerId so multiple routers stay independent.

export interface BwPoint {
  time: string;
  rx: number;
  tx: number;
}

export interface BwState {
  points: BwPoint[];
  live: { rx: number; tx: number } | null;
  ifaceStats: Array<{ name: string; rxBps: number; txBps: number }>;
  peakRx: number;
  peakTx: number;
}

export interface ResourceState {
  routerId: string;
  cpuLoadPct: number;
  freeMemoryMb: number;
  totalMemoryMb: number;
  temperatureC?: number;
  voltageV?: number;
}

const _bw = new Map<string, BwState>();
const _res = new Map<string, ResourceState>();
// Generic TTL cache for tab-switch data
interface CacheEntry<T> { data: T; ts: number }
const _generic = new Map<string, CacheEntry<unknown>>();

export const liveCache = {
  // ── Bandwidth ──────────────────────────────────────────────────────────────
  getBandwidth(routerId: string): BwState | undefined {
    return _bw.get(routerId);
  },
  setBandwidth(routerId: string, state: BwState): void {
    _bw.set(routerId, { ...state, points: state.points.slice(-120) });
  },
  clearBandwidth(routerId: string): void {
    _bw.delete(routerId);
  },

  // ── Resource ───────────────────────────────────────────────────────────────
  getResource(routerId: string): ResourceState | undefined {
    return _res.get(routerId);
  },
  setResource(routerId: string, state: ResourceState): void {
    _res.set(routerId, state);
  },

  // ── Generic TTL cache ──────────────────────────────────────────────────────
  get<T>(key: string, ttlMs = 60_000): T | undefined {
    const e = _generic.get(key) as CacheEntry<T> | undefined;
    if (!e) return undefined;
    if (Date.now() - e.ts > ttlMs) { _generic.delete(key); return undefined; }
    return e.data;
  },
  set<T>(key: string, data: T): void {
    _generic.set(key, { data, ts: Date.now() });
  },
};
