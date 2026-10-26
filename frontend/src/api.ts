const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

const responseCache = new Map<string, { expires: number; data: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

const DEFAULT_TTL_MS = 10 * 60 * 1000;

// #region agent log
export function dbg(hypothesisId: string, location: string, message: string, data: Record<string, unknown>) {
  const body = {
    sessionId: "fdc9ac",
    runId: "pre-fix",
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  };
  fetch("http://127.0.0.1:7803/ingest/53cf5f24-0770-4216-8ee3-812030475ac3", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "fdc9ac" },
    body: JSON.stringify(body),
  }).catch(() => {});
  fetch(`${API_BASE}/debug/client-log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {});
}
// #endregion

async function getJson<T>(path: string, opts?: { ttlMs?: number; cache?: boolean }): Promise<T> {
  const cacheable = opts?.cache !== false;
  const ttlMs = opts?.ttlMs ?? DEFAULT_TTL_MS;
  const key = path;

  if (cacheable) {
    const hit = responseCache.get(key);
    if (hit && hit.expires > Date.now()) {
      // #region agent log
      if (path.startsWith("/districts") || path.startsWith("/green-spaces")) {
        const fc = hit.data as { features?: unknown[] };
        dbg("A", "api.ts:getJson", "cache HIT", { path, featureCount: fc.features?.length ?? null });
      }
      // #endregion
      return hit.data as T;
    }
    const pending = inflight.get(key);
    if (pending) {
      return pending as Promise<T>;
    }
  }

  const request = (async () => {
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as T;
    // #region agent log
    if (path.startsWith("/districts") || path.startsWith("/green-spaces")) {
      const fc = data as {
        features?: Array<{
          properties?: { name?: string };
          geometry?: { type?: string; coordinates?: unknown };
        }>;
      };
      const ringPts = (fc.features ?? []).slice(0, 3).map((f) => {
        const g = f.geometry;
        if (!g?.coordinates) return 0;
        const c = g.coordinates as unknown[][];
        const ring = g.type === "MultiPolygon" ? (c[0]?.[0] as unknown[]) : (c[0] as unknown[]);
        return Array.isArray(ring) ? ring.length : 0;
      });
      dbg(path.startsWith("/districts") ? "B" : "C", "api.ts:getJson", "network fetch OK", {
        path,
        status: res.status,
        featureCount: fc.features?.length ?? 0,
        sampleNames: (fc.features ?? []).slice(0, 3).map((f) => f.properties?.name ?? null),
        sampleRingPts: ringPts,
      });
    }
    // #endregion
    if (cacheable) {
      responseCache.set(key, { expires: Date.now() + ttlMs, data });
    }
    return data;
  })();

  if (cacheable) {
    inflight.set(key, request);
    try {
      return await request;
    } finally {
      inflight.delete(key);
    }
  }

  return request;
}

export function clearApiCache(): void {
  responseCache.clear();
  inflight.clear();
}

export type LayerMeta = {
  slug: string;
  name: string;
  description?: string;
  source_organization?: string;
  source_url?: string;
  license_text?: string;
  source_vintage?: string | null;
  imported_at?: string | null;
  srid: number;
  geometry_type?: string;
  coverage_caveat?: string;
};

export type DistrictListItem = { id: number; official_id: string; name: string };

export type FeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    id?: number | string;
    geometry: { type: string; coordinates: unknown };
    properties?: Record<string, unknown> | null;
  }>;
};

export type AnalysisResponse = {
  id: string;
  title: string;
  inputs: string[];
  operation: string;
  units: Record<string, string>;
  crs: string;
  caveat: string;
  threshold_m?: number;
  results: Record<string, unknown>[];
};

export type NearestAmenities = {
  id: string;
  title: string;
  lon: number;
  lat: number;
  crs: string;
  caveat: string;
  nearest: Array<{
    layer: string;
    id?: number;
    name?: string | null;
    distance_m: number;
  }>;
};

export type BBox = [west: number, south: number, east: number, north: number];

export function formatBbox(bbox: BBox): string {
  return bbox.map((n) => n.toFixed(5)).join(",");
}

/** Expand viewport bbox so small pans stay inside a loaded tile. */
export function padBbox(bbox: BBox, factor = 0.5): BBox {
  const [w, s, e, n] = bbox;
  const dx = (e - w) * factor;
  const dy = (n - s) * factor;
  return [w - dx, s - dy, e + dx, n + dy];
}

export function bboxContains(outer: BBox, inner: BBox): boolean {
  return inner[0] >= outer[0] && inner[1] >= outer[1] && inner[2] <= outer[2] && inner[3] <= outer[3];
}

export function boundsToBbox(bounds: {
  getWest(): number;
  getSouth(): number;
  getEast(): number;
  getNorth(): number;
}): BBox {
  return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
}

function layerQuery(bbox?: string, districtId?: number): string {
  const q = new URLSearchParams();
  if (bbox) q.set("bbox", bbox);
  if (districtId) q.set("district_id", String(districtId));
  const qs = q.toString();
  return qs ? `?${qs}` : "";
}

export const api = {
  layers: () => getJson<LayerMeta[]>("/layers", { ttlMs: 60_000 }),
  districtsList: () => getJson<DistrictListItem[]>("/districts/list", { ttlMs: 60_000 }),
  districts: (bbox?: string) =>
    getJson<FeatureCollection>(`/districts${bbox ? `?bbox=${bbox}` : ""}`, { ttlMs: 30_000 }),
  greenSpaces: (bbox?: string, districtId?: number) =>
    getJson<FeatureCollection>(`/green-spaces${layerQuery(bbox, districtId)}`),
  schools: (bbox?: string, districtId?: number) =>
    getJson<FeatureCollection>(`/schools${layerQuery(bbox, districtId)}`),
  trees: (bbox?: string, districtId?: number) =>
    getJson<FeatureCollection>(`/trees${layerQuery(bbox, districtId)}`),
  bikeParking: (bbox?: string, districtId?: number) =>
    getJson<FeatureCollection>(`/bike-parking${layerQuery(bbox, districtId)}`),
  evChargers: (bbox?: string, districtId?: number) =>
    getJson<FeatureCollection>(`/ev-chargers${layerQuery(bbox, districtId)}`),
  drinkingFountains: (bbox?: string, districtId?: number) =>
    getJson<FeatureCollection>(`/drinking-fountains${layerQuery(bbox, districtId)}`),
  bathingWaters: (bbox?: string, districtId?: number) =>
    getJson<FeatureCollection>(`/bathing-waters${layerQuery(bbox, districtId)}`),
  /** Point checks are not cached — each click is a distinct query. */
  nearestAmenities: (lon: number, lat: number) =>
    getJson<NearestAmenities>(`/analyses/nearest-amenities?lon=${lon}&lat=${lat}`, { cache: false }),
  amenityDensityByBorough: () => getJson<AnalysisResponse>("/analyses/amenity-density-by-borough"),
  greenByBorough: () => getJson<AnalysisResponse>("/analyses/green-by-borough"),
  schoolGreenProximity: (threshold = 500, districtId?: number) => {
    const q = new URLSearchParams({ threshold_m: String(threshold) });
    if (districtId) q.set("district_id", String(districtId));
    return getJson<AnalysisResponse>(`/analyses/school-green-proximity?${q}`);
  },
};
