import { useEffect, useRef, useState } from "react";
import maplibregl, { Map, LngLatBoundsLike, Marker } from "maplibre-gl";
import {
  AnalysisResponse,
  BBox,
  DistrictListItem,
  FeatureCollection,
  LayerMeta,
  NearestAmenities,
  SqlRunResult,
  api,
  bboxContains,
  boundsToBbox,
  clearApiCache,
  formatBbox,
  padBbox,
} from "./api";
import { PATTERNS, SCHEMA_TABLES, SchemaTable } from "./exercises";

type Visibility = {
  districts: boolean;
  neighborhoods: boolean;
  green_spaces: boolean;
  schools: boolean;
  trees: boolean;
  bike_parking: boolean;
  ev_chargers: boolean;
  drinking_fountains: boolean;
  bathing_waters: boolean;
  toilets: boolean;
  playgrounds: boolean;
  sports_facilities: boolean;
};

const LAYER_META: Record<
  keyof Visibility,
  { label: string; swatch: string; kind: "fill" | "dot" | "line" }
> = {
  districts: { label: "Districts", swatch: "#1f4e79", kind: "line" },
  neighborhoods: { label: "Neighborhoods", swatch: "#9bb0bf", kind: "line" },
  green_spaces: { label: "Parks", swatch: "#1f8a5b", kind: "fill" },
  playgrounds: { label: "Playgrounds", swatch: "#c4a035", kind: "fill" },
  schools: { label: "Schools", swatch: "#c45c26", kind: "dot" },
  trees: { label: "Street trees", swatch: "#2f6b3c", kind: "dot" },
  bike_parking: { label: "Bike parking", swatch: "#0f6a5a", kind: "dot" },
  ev_chargers: { label: "EV chargers", swatch: "#1a6fbf", kind: "dot" },
  drinking_fountains: { label: "Drinking fountains", swatch: "#3a7ca5", kind: "dot" },
  bathing_waters: { label: "Bathing waters", swatch: "#0b6e99", kind: "dot" },
  toilets: { label: "Public toilets", swatch: "#6b5b7a", kind: "dot" },
  sports_facilities: { label: "Sports facilities", swatch: "#b33b3b", kind: "dot" },
};

const LAYER_LABELS: Record<string, string> = {
  trees: "Street tree",
  bike_parking: "Bike parking",
  ev_chargers: "EV charger",
  drinking_fountains: "Drinking fountain",
  bathing_waters: "Bathing water",
  toilets: "Public toilet",
  playgrounds: "Playground",
  sports_facilities: "Sports facility",
  green_spaces: "Park",
};

const LAYER_SQL_REF: Partial<Record<keyof Visibility, string>> = {
  districts: "districts_geojson.sql",
  neighborhoods: "neighborhoods_geojson.sql",
  green_spaces: "green_spaces_geojson.sql",
  schools: "schools_geojson.sql",
  trees: "trees_geojson.sql",
  bike_parking: "bike_parking_geojson.sql",
  ev_chargers: "ev_chargers_geojson.sql",
  drinking_fountains: "drinking_fountains_geojson.sql",
  bathing_waters: "bathing_waters_geojson.sql",
  toilets: "toilets_geojson.sql",
  playgrounds: "playgrounds_geojson.sql",
  sports_facilities: "sports_facilities_geojson.sql",
};

type TaskTab = "nearby" | "compare" | "query";

type CompareMeasure =
  | "bike_parking"
  | "ev_chargers"
  | "drinking_fountains"
  | "toilets"
  | "playgrounds"
  | "sports_facilities"
  | "bathing_waters"
  | "trees"
  | "green_pct"
  | "school_park";

const COMPARE_MEASURES: Array<{ id: CompareMeasure; label: string }> = [
  { id: "bike_parking", label: "Bike parking" },
  { id: "ev_chargers", label: "EV chargers" },
  { id: "drinking_fountains", label: "Fountains" },
  { id: "toilets", label: "Toilets" },
  { id: "playgrounds", label: "Playgrounds" },
  { id: "sports_facilities", label: "Sports" },
  { id: "bathing_waters", label: "Bathing" },
  { id: "trees", label: "Trees" },
  { id: "green_pct", label: "Green cover %" },
  { id: "school_park", label: "School–park median" },
];

/** Layers to enable when pinning a Compare measure's SQL. */
const COMPARE_MEASURE_LAYERS: Record<CompareMeasure, (keyof Visibility)[]> = {
  bike_parking: ["districts", "bike_parking"],
  ev_chargers: ["districts", "ev_chargers"],
  drinking_fountains: ["districts", "drinking_fountains"],
  toilets: ["districts", "toilets"],
  playgrounds: ["districts", "playgrounds"],
  sports_facilities: ["districts", "sports_facilities"],
  bathing_waters: ["districts", "bathing_waters"],
  trees: ["districts", "trees"],
  green_pct: ["districts", "green_spaces"],
  school_park: ["districts", "schools", "green_spaces"],
};

const SQL_TO_LAYER_SLUG: Record<string, string> = {
  "districts_geojson.sql": "districts",
  "neighborhoods_geojson.sql": "neighborhoods",
  "green_spaces_geojson.sql": "green_spaces",
  "schools_geojson.sql": "schools",
  "trees_geojson.sql": "trees",
  "bike_parking_geojson.sql": "bike_parking",
  "ev_chargers_geojson.sql": "ev_chargers",
  "drinking_fountains_geojson.sql": "drinking_fountains",
  "bathing_waters_geojson.sql": "bathing_waters",
  "toilets_geojson.sql": "toilets",
  "playgrounds_geojson.sql": "playgrounds",
  "sports_facilities_geojson.sql": "sports_facilities",
};

/** Table name in SQL → layer checkbox key. */
const TABLE_TO_LAYER: Record<string, keyof Visibility> = {
  districts: "districts",
  neighborhoods: "neighborhoods",
  green_spaces: "green_spaces",
  schools: "schools",
  trees: "trees",
  bike_parking: "bike_parking",
  ev_chargers: "ev_chargers",
  drinking_fountains: "drinking_fountains",
  bathing_waters: "bathing_waters",
  toilets: "toilets",
  playgrounds: "playgrounds",
  sports_facilities: "sports_facilities",
};

function layersFromSql(sql: string): Set<keyof Visibility> {
  const found = new Set<keyof Visibility>();
  const lower = sql.toLowerCase();
  for (const [table, key] of Object.entries(TABLE_TO_LAYER)) {
    if (new RegExp(`\\b${table}\\b`).test(lower)) found.add(key);
  }
  return found;
}

const EMPTY_FC: FeatureCollection = { type: "FeatureCollection", features: [] };

type LayerCounts = Partial<Record<keyof Visibility, number>>;

const BERLIN_CENTER: [number, number] = [13.405, 52.52];
/** Soft pan limit — gray mask uses real borough polygons; this stops world wandering. */
const BERLIN_MAX_BOUNDS: LngLatBoundsLike = [
  [12.95, 52.28],
  [13.85, 52.75],
];
const BBOX_PAD = 0.6;
const MOVE_DEBOUNCE_MS = 250;
const TREES_MIN_ZOOM = 14;

const WORLD_RING: [number, number][] = [
  [-180, -85],
  [-180, 85],
  [180, 85],
  [180, -85],
  [-180, -85],
];

type QueryDoc = {
  title: string;
  filename: string | null;
  sql: string;
  savedSql: string;
  caveat?: string;
};

const KNOWN_BINDS = [
  "threshold_m",
  "district_id",
  "minx",
  "miny",
  "maxx",
  "maxy",
  "lon",
  "lat",
] as const;

const ANALYSIS_TITLES: Record<string, string> = {
  "analysis_nearest_amenities.sql": "Nearest amenities",
  "analysis_amenity_density_by_borough.sql": "Amenity counts",
  "analysis_green_by_borough.sql": "Green cover",
  "analysis_school_green_proximity.sql": "School–park median",
};

function titleForSqlFile(name: string): string {
  const slug = SQL_TO_LAYER_SLUG[name];
  if (slug && slug in LAYER_META) return LAYER_META[slug as keyof Visibility].label;
  return ANALYSIS_TITLES[name] ?? name;
}

function makeDoc(
  title: string,
  sql: string,
  opts?: { filename?: string | null; caveat?: string }
): QueryDoc {
  return {
    title,
    filename: opts?.filename ?? null,
    sql,
    savedSql: sql,
    caveat: opts?.caveat,
  };
}

function detectBinds(sql: string): string[] {
  return KNOWN_BINDS.filter((b) => sql.includes(`:${b}`));
}

function fillBindsFromMap(sql: string, values: Record<string, number | null>): string {
  let out = sql;
  for (const key of KNOWN_BINDS) {
    if (!out.includes(`:${key}`)) continue;
    const v = values[key];
    const lit = v == null || Number.isNaN(v) ? "NULL" : String(v);
    out = out.split(`:${key}`).join(lit);
  }
  return out;
}

/** Ring signed area: positive = CCW (GeoJSON exterior). */
function ringArea(ring: [number, number][]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return sum / 2;
}

function asHoleRing(ring: [number, number][]): [number, number][] {
  const closed =
    ring.length > 0 && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])
      ? [...ring, ring[0]]
      : [...ring];
  // Holes must be opposite winding to the exterior (WORLD_RING is CCW).
  return ringArea(closed) > 0 ? closed.reverse() : closed;
}

/** World polygon with Berlin borough exteriors punched as holes → gray outside the city. */
function berlinOutsideMask(districts: FeatureCollection): FeatureCollection {
  const holes: [number, number][][] = [];
  for (const f of districts.features) {
    const g = f.geometry;
    if (g.type === "Polygon") {
      const coords = g.coordinates as [number, number][][];
      const exterior = coords[0];
      if (exterior?.length >= 4) holes.push(asHoleRing(exterior));
    } else if (g.type === "MultiPolygon") {
      const coords = g.coordinates as [number, number][][][];
      for (const poly of coords) {
        const exterior = poly[0];
        if (exterior?.length >= 4) holes.push(asHoleRing(exterior));
      }
    }
  }
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { layer: "berlin_mask" },
        geometry: {
          type: "Polygon",
          coordinates: [WORLD_RING, ...holes],
        },
      },
    ],
  };
}

function ensureBerlinMask(map: Map, districts: FeatureCollection) {
  const mask = berlinOutsideMask(districts);
  if (!mask.features[0] || (mask.features[0].geometry as { coordinates: unknown[] }).coordinates.length < 2) {
    return;
  }
  if (map.getSource("berlin_mask")) {
    (map.getSource("berlin_mask") as maplibregl.GeoJSONSource).setData(mask as never);
  } else {
    map.addSource("berlin_mask", { type: "geojson", data: mask as never });
    map.addLayer(
      {
        id: "berlin_mask-layer",
        type: "fill",
        source: "berlin_mask",
        paint: {
          "fill-color": "#9aa3a0",
          "fill-opacity": 0.72,
        },
      },
      // Sit above basemap, under data layers when those exist.
      map.getLayer("green_spaces-layer") ? "green_spaces-layer" : undefined
    );
  }
}

function zoomCirclePaint(color: string, opts?: { low?: number; mid?: number; high?: number; opacity?: number }) {
  const low = opts?.low ?? 1.8;
  const mid = opts?.mid ?? 3.5;
  const high = opts?.high ?? 6;
  const opacity = opts?.opacity ?? 0.8;
  return {
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, low, 13, mid, 16, high] as never,
    "circle-color": color,
    "circle-stroke-width": 0.7,
    "circle-stroke-color": "#fff",
    "circle-opacity": ["interpolate", ["linear"], ["zoom"], 9, opacity * 0.55, 13, opacity] as never,
  };
}

export default function App() {
  const mapRef = useRef<Map | null>(null);
  const mapNode = useRef<HTMLDivElement | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const loadedExtentRef = useRef<BBox | null>(null);
  const loadedDistrictRef = useRef<number | "">("");
  const loadSeqRef = useRef(0);
  const densityLoadedRef = useRef(false);
  const treesLoadedRef = useRef(false);
  const treesZoomOkRef = useRef(false);

  const [layers, setLayers] = useState<LayerMeta[]>([]);
  const [districts, setDistricts] = useState<DistrictListItem[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState<number | "">("");
  const [visibility, setVisibility] = useState<Visibility>({
    districts: true,
    neighborhoods: false,
    green_spaces: false,
    schools: false,
    trees: false,
    bike_parking: true,
    ev_chargers: true,
    drinking_fountains: true,
    bathing_waters: true,
    toilets: false,
    playgrounds: false,
    sports_facilities: false,
  });
  const visibilityRef = useRef(visibility);
  visibilityRef.current = visibility;
  const [status, setStatus] = useState("Loading map…");
  const [layerError, setLayerError] = useState<string | null>(null);
  const [nearestError, setNearestError] = useState<string | null>(null);
  const [nearest, setNearest] = useState<NearestAmenities | null>(null);
  const [density, setDensity] = useState<AnalysisResponse | null>(null);
  const [greenBorough, setGreenBorough] = useState<AnalysisResponse | null>(null);
  const [schoolGreen, setSchoolGreen] = useState<AnalysisResponse | null>(null);
  const [mapZoom, setMapZoom] = useState(10.4);
  const [queryDoc, setQueryDoc] = useState<QueryDoc | null>(null);
  const [pendingReplace, setPendingReplace] = useState<QueryDoc | null>(null);
  const [sqlOffer, setSqlOffer] = useState<QueryDoc | null>(null);
  const [lastClick, setLastClick] = useState<{ lon: number; lat: number } | null>(null);
  const [taskTab, setTaskTab] = useState<TaskTab>("nearby");
  const [compareMeasure, setCompareMeasure] = useState<CompareMeasure>("bike_parking");
  const [layerCounts, setLayerCounts] = useState<LayerCounts>({});
  const [sqlRun, setSqlRun] = useState<SqlRunResult | null>(null);
  const [sqlBusy, setSqlBusy] = useState(false);
  const [sqlError, setSqlError] = useState<string | null>(null);
  const [showQueryOnMap, setShowQueryOnMap] = useState(false);
  const [activePatternId, setActivePatternId] = useState<string | null>(null);
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [panelPct, setPanelPct] = useState(() => {
    try {
      const raw = localStorage.getItem("berlin-panel-pct-v2");
      const n = raw == null ? NaN : Number(raw);
      if (Number.isFinite(n) && n >= 20 && n <= 80) return n;
    } catch {
      /* ignore */
    }
    return 40;
  });
  const [draggingSplit, setDraggingSplit] = useState(false);
  const appRef = useRef<HTMLDivElement | null>(null);
  const taskTabRef = useRef(taskTab);
  taskTabRef.current = taskTab;

  const treesZoomOk = mapZoom >= TREES_MIN_ZOOM;
  const treesNeedZoom = visibility.trees && !treesZoomOk;
  const selectedDistrictName =
    selectedDistrict === ""
      ? null
      : districts.find((d) => d.id === selectedDistrict)?.name ?? null;
  const queryBinds = queryDoc ? detectBinds(queryDoc.sql) : [];
  const queryDirty = queryDoc != null && queryDoc.sql !== queryDoc.savedSql;
  const activePattern = PATTERNS.find((p) => p.id === activePatternId) ?? null;

  useEffect(() => {
    try {
      localStorage.setItem("berlin-panel-pct-v2", String(panelPct));
    } catch {
      /* ignore */
    }
    const map = mapRef.current;
    if (map) {
      requestAnimationFrame(() => map.resize());
    }
  }, [panelPct]);

  useEffect(() => {
    const onResize = () => {
      const map = mapRef.current;
      if (map) requestAnimationFrame(() => map.resize());
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!draggingSplit) return;

    const onMove = (e: PointerEvent) => {
      const root = appRef.current;
      if (!root) return;
      const rect = root.getBoundingClientRect();
      if (rect.width <= 0) return;
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setPanelPct(Math.min(80, Math.max(20, pct)));
    };
    const onUp = () => setDraggingSplit(false);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [draggingSplit]);

  useEffect(() => {
    if (!mapNode.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapNode.current,
      // Free vector basemap (OpenFreeMap) — no API key. Place labels hidden below.
      style: "https://tiles.openfreemap.org/styles/positron",
      center: BERLIN_CENTER,
      zoom: 10.4,
      minZoom: 9,
      maxZoom: 18,
      maxBounds: BERLIN_MAX_BOUNDS,
      renderWorldCopies: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;
    map.on("load", () => {
      // Drop basemap place names so Ortsteil labels aren't duplicated.
      for (const layer of map.getStyle().layers ?? []) {
        if (layer.type !== "symbol") continue;
        const id = layer.id;
        if (id.startsWith("label_") || id === "airport") {
          map.setLayoutProperty(id, "visibility", "none");
        }
      }
      setStatus("Click the map to find nearby amenities");
      setMapZoom(map.getZoom());
    });

    const onClick = async (e: maplibregl.MapMouseEvent) => {
      const { lng, lat } = e.lngLat;
      if (markerRef.current) markerRef.current.remove();
      markerRef.current = new maplibregl.Marker({ color: "#1f5c4d" }).setLngLat([lng, lat]).addTo(map);
      setLastClick({ lon: lng, lat });
      try {
        setNearestError(null);
        setStatus(`Looking up ${lng.toFixed(5)}, ${lat.toFixed(5)}…`);
        const result = await api.nearestAmenities(lng, lat);
        setNearest(result);
        if (taskTabRef.current === "compare") {
          setTaskTab("nearby");
        }
        if (result.sql_ref) {
          try {
            const file = await api.sqlFile(result.sql_ref);
            setSqlOffer(
              makeDoc(titleForSqlFile(file.name), file.sql, { filename: file.name, caveat: result.caveat })
            );
          } catch {
            /* ignore inspector fetch errors */
          }
        }
        const closest = result.nearest?.[0];
        setStatus(
          closest
            ? `Nearest: ${LAYER_LABELS[closest.layer] ?? closest.layer} at ${closest.distance_m.toFixed(0)} m`
            : "No amenities loaded yet — run the import script"
        );
      } catch (err) {
        setNearestError(err instanceof Error ? err.message : "Lookup failed");
        setStatus("Lookup failed");
      }
    };
    map.on("click", onClick);

    const onZoom = () => setMapZoom(map.getZoom());
    map.on("zoom", onZoom);
    map.on("zoomend", onZoom);

    return () => {
      map.off("click", onClick);
      map.off("zoom", onZoom);
      map.off("zoomend", onZoom);
      markerRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    // Drop any in-memory GeoJSON left from a previous sample import.
    clearApiCache();
    Promise.all([api.layers(), api.districtsList()])
      .then(([layerMeta, districtList]) => {
        setLayers(layerMeta);
        setDistricts(districtList);
      })
      .catch((err: Error) => setLayerError(err.message));
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const applyVisibility = () => {
      (Object.keys(visibilityRef.current) as (keyof Visibility)[]).forEach((key) => {
        let visible = visibilityRef.current[key];
        if (key === "trees" && visible && map.getZoom() < TREES_MIN_ZOOM) {
          visible = false;
        }
        const value = visible ? "visible" : "none";
        for (const suffix of ["-layer", "-outline", "-line", "-label"]) {
          const layerId = `${key}${suffix}`;
          if (map.getLayer(layerId)) {
            map.setLayoutProperty(layerId, "visibility", value);
          }
        }
      });
    };

    const loadLayers = async (force: boolean) => {
      const districtId = selectedDistrict === "" ? undefined : selectedDistrict;
      const viewport = boundsToBbox(map.getBounds());
      const zoomOk = map.getZoom() >= TREES_MIN_ZOOM;
      const wantTrees = visibilityRef.current.trees && zoomOk;

      if (districtId != null) {
        if (
          !force &&
          loadedDistrictRef.current === selectedDistrict &&
          treesLoadedRef.current === wantTrees
        ) {
          return;
        }
      } else {
        if (
          !force &&
          loadedExtentRef.current &&
          bboxContains(loadedExtentRef.current, viewport) &&
          treesLoadedRef.current === wantTrees
        ) {
          return;
        }
      }

      const fetchBbox =
        districtId != null ? undefined : formatBbox(padBbox(viewport, BBOX_PAD));
      const extentToStore =
        districtId != null ? null : padBbox(viewport, BBOX_PAD);

      const seq = ++loadSeqRef.current;
      try {
        setLayerError(null);
        setStatus("Loading layers…");

        const [
          districtFc,
          neighborhoodFc,
          greenFc,
          playgroundFc,
          schoolFc,
          treeFc,
          bikeFc,
          evFc,
          fountainFc,
          bathingFc,
          toiletFc,
          sportsFc,
          dens,
          green,
        ] = await Promise.all([
          api.districts(),
          api.neighborhoods(),
          api.greenSpaces(fetchBbox, districtId),
          api.playgrounds(fetchBbox, districtId),
          api.schools(fetchBbox, districtId),
          wantTrees ? api.trees(fetchBbox, districtId) : Promise.resolve(EMPTY_FC),
          api.bikeParking(fetchBbox, districtId),
          api.evChargers(fetchBbox, districtId),
          api.drinkingFountains(fetchBbox, districtId),
          api.bathingWaters(fetchBbox, districtId),
          api.toilets(fetchBbox, districtId),
          api.sportsFacilities(fetchBbox, districtId),
          densityLoadedRef.current
            ? Promise.resolve(null as AnalysisResponse | null)
            : api.amenityDensityByBorough(),
          densityLoadedRef.current
            ? Promise.resolve(null as AnalysisResponse | null)
            : api.greenByBorough(),
        ]);

        if (seq !== loadSeqRef.current) return;

        if (dens) {
          setDensity(dens);
          densityLoadedRef.current = true;
        }
        if (green) setGreenBorough(green);

        setLayerCounts((prev) => ({
          ...prev,
          districts: districtFc.features.length,
          neighborhoods: neighborhoodFc.features.length,
          green_spaces: greenFc.features.length,
          playgrounds: playgroundFc.features.length,
          schools: schoolFc.features.length,
          ...(wantTrees ? { trees: treeFc.features.length } : {}),
          bike_parking: bikeFc.features.length,
          ev_chargers: evFc.features.length,
          drinking_fountains: fountainFc.features.length,
          bathing_waters: bathingFc.features.length,
          toilets: toiletFc.features.length,
          sports_facilities: sportsFc.features.length,
        }));

        ensureBerlinMask(map, districtFc);

        // Parks/fills first; borough outlines added last so they stay readable on top.
        ensureSource(map, "green_spaces", greenFc, {
          type: "fill",
          paint: {
            "fill-color": "#2f855a",
            "fill-opacity": 0.18,
          },
          outline: {
            "line-color": "#276749",
            "line-width": 0.8,
            "line-opacity": 0.45,
          },
        });
        ensureSource(map, "playgrounds", playgroundFc, {
          type: "fill",
          paint: {
            "fill-color": "#c4a035",
            "fill-opacity": 0.35,
          },
          outline: {
            "line-color": "#8a7020",
            "line-width": 0.9,
            "line-opacity": 0.7,
          },
        });
        ensureSource(map, "schools", schoolFc, {
          type: "circle",
          paint: zoomCirclePaint("#c45c26", { low: 2, mid: 3.5, high: 6.5, opacity: 0.85 }),
        });
        ensureSource(map, "trees", treeFc, {
          type: "circle",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 14, 2, 17, 4.5] as never,
            "circle-color": "#2f6b3c",
            "circle-stroke-width": 0,
            "circle-opacity": 0.55,
          },
          minzoom: TREES_MIN_ZOOM,
        });
        ensureSource(map, "bike_parking", bikeFc, {
          type: "circle",
          paint: zoomCirclePaint("#0f6a5a"),
        });
        ensureSource(map, "ev_chargers", evFc, {
          type: "circle",
          paint: zoomCirclePaint("#1a6fbf"),
        });
        ensureSource(map, "drinking_fountains", fountainFc, {
          type: "circle",
          paint: zoomCirclePaint("#3a7ca5", { low: 2.2, mid: 4, high: 7, opacity: 0.88 }),
        });
        ensureSource(map, "bathing_waters", bathingFc, {
          type: "circle",
          paint: zoomCirclePaint("#0b6e99", { low: 3, mid: 5, high: 8, opacity: 0.92 }),
        });
        ensureSource(map, "toilets", toiletFc, {
          type: "circle",
          paint: zoomCirclePaint("#6b5b7a"),
        });
        ensureSource(map, "sports_facilities", sportsFc, {
          type: "circle",
          paint: zoomCirclePaint("#b33b3b"),
        });
        ensureSource(map, "neighborhoods", neighborhoodFc, {
          type: "line",
          paint: {
            "line-color": "#9bb0bf",
            "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1.8, 13, 3.2] as never,
            "line-opacity": 0.85,
          },
        });
        ensureNeighborhoodLabels(map);
        ensureSource(map, "districts", districtFc, {
          type: "line",
          paint: {
            "line-color": "#102a43",
            "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2.4, 13, 4] as never,
            "line-opacity": 0.95,
          },
        });
        if (map.getLayer("berlin_mask-layer") && map.getLayer("neighborhoods-line")) {
          map.moveLayer("berlin_mask-layer", "neighborhoods-line");
        }
        if (map.getLayer("neighborhoods-line") && map.getLayer("districts-line")) {
          map.moveLayer("neighborhoods-line", "districts-line");
        }
        if (map.getLayer("neighborhoods-label") && map.getLayer("districts-line")) {
          map.moveLayer("neighborhoods-label", "districts-line");
        }
        if (map.getLayer("districts-line")) {
          map.moveLayer("districts-line");
        }

        applyVisibility();
        loadedExtentRef.current = extentToStore;
        loadedDistrictRef.current = selectedDistrict;
        treesLoadedRef.current = wantTrees;
        treesZoomOkRef.current = zoomOk;

        setStatus(
          `Loaded parks ${greenFc.features.length}, playgrounds ${playgroundFc.features.length}, ` +
            `bikes ${bikeFc.features.length}, EV ${evFc.features.length}, ` +
            `fountains ${fountainFc.features.length}, toilets ${toiletFc.features.length}, ` +
            `sports ${sportsFc.features.length}, trees ${treeFc.features.length}`
        );
      } catch (err) {
        if (seq !== loadSeqRef.current) return;
        setLayerError(err instanceof Error ? err.message : "Failed to load layers");
        setStatus("Layer load failed");
      }
    };

    const run = () => {
      void loadLayers(true);
    };

    if (map.isStyleLoaded()) run();
    else map.once("load", run);

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const onMoveEnd = () => {
      if (selectedDistrict !== "") {
        // Still re-check trees zoom gate while focused on a borough.
        const zoomOk = map.getZoom() >= TREES_MIN_ZOOM;
        if (visibilityRef.current.trees && zoomOk !== treesZoomOkRef.current) {
          void loadLayers(true);
        }
        return;
      }
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void loadLayers(false);
      }, MOVE_DEBOUNCE_MS);
    };
    map.on("moveend", onMoveEnd);
    map.on("zoomend", onMoveEnd);

    return () => {
      map.off("moveend", onMoveEnd);
      map.off("zoomend", onMoveEnd);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [selectedDistrict]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const overlayActive = Boolean(showQueryOnMap && sqlRun?.geojson?.features?.length);
    (Object.keys(visibility) as (keyof Visibility)[]).forEach((key) => {
      let visible = visibility[key];
      if (key === "trees" && visible && map.getZoom() < TREES_MIN_ZOOM) {
        visible = false;
      }
      // Query overlay owns amenity geometry — hide inventory layers underneath so points aren't doubled.
      if (overlayActive && key !== "districts" && key !== "neighborhoods") {
        visible = false;
      }
      const value = visible ? "visible" : "none";
      for (const suffix of ["-layer", "-outline", "-line", "-label"]) {
        const layerId = `${key}${suffix}`;
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, "visibility", value);
        }
      }
    });
    // Turning trees on at sufficient zoom should fetch them.
    if (visibility.trees && map.getZoom() >= TREES_MIN_ZOOM && !treesLoadedRef.current) {
      loadedExtentRef.current = null;
      loadedDistrictRef.current = "";
      map.fire("moveend");
    }
    if (!visibility.trees && treesLoadedRef.current) {
      const src = map.getSource("trees") as maplibregl.GeoJSONSource | undefined;
      src?.setData(EMPTY_FC as never);
      treesLoadedRef.current = false;
    }
  }, [visibility, mapZoom, showQueryOnMap, sqlRun]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (showQueryOnMap && sqlRun?.geojson) {
      ensureUserQueryOverlay(map, sqlRun.geojson);
    } else {
      for (const id of ["user_query-fill", "user_query-outline", "user_query-circle", "user_query-line"]) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
      }
    }
  }, [showQueryOnMap, sqlRun]);

  const fitDistrict = (districtId: number | "") => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource("districts") as maplibregl.GeoJSONSource | undefined;
    const data = (src as unknown as { _data?: FeatureCollection })?._data;
    if (!data?.features?.length) return;

    if (districtId === "") {
      const bounds = new maplibregl.LngLatBounds();
      for (const feature of data.features) {
        if (feature.geometry.type === "GeometryCollection") continue;
        flattenCoords(feature.geometry.coordinates).forEach(([lng, lat]) => bounds.extend([lng, lat]));
      }
      if (!bounds.isEmpty()) map.fitBounds(bounds as LngLatBoundsLike, { padding: 48, duration: 0 });
      return;
    }

    const feature = data.features.find((f) => f.properties?.id === districtId);
    if (!feature || feature.geometry.type === "GeometryCollection") return;
    const bounds = new maplibregl.LngLatBounds();
    flattenCoords(feature.geometry.coordinates).forEach(([lng, lat]) => bounds.extend([lng, lat]));
    if (!bounds.isEmpty()) map.fitBounds(bounds as LngLatBoundsLike, { padding: 48, duration: 0 });
  };

  const selectBorough = (districtId: number | "") => {
    setSelectedDistrict(districtId);
    fitDistrict(districtId);
  };

  const getBindValues = (): Record<string, number | null> => {
    const map = mapRef.current;
    const bounds = map?.getBounds();
    const center = map?.getCenter();
    return {
      minx: bounds ? Number(bounds.getWest().toFixed(5)) : null,
      miny: bounds ? Number(bounds.getSouth().toFixed(5)) : null,
      maxx: bounds ? Number(bounds.getEast().toFixed(5)) : null,
      maxy: bounds ? Number(bounds.getNorth().toFixed(5)) : null,
      lon: lastClick?.lon ?? (center ? Number(center.lng.toFixed(5)) : BERLIN_CENTER[0]),
      lat: lastClick?.lat ?? (center ? Number(center.lat.toFixed(5)) : BERLIN_CENTER[1]),
      district_id: selectedDistrict === "" ? null : selectedDistrict,
      threshold_m: 500,
    };
  };

  /** Sync layer checkboxes to tables in the SQL; draw GeoJSON results on the map. */
  const applyQueryToMap = (sql: string, result: SqlRunResult | null, explain: boolean) => {
    const mentioned = layersFromSql(sql);
    if (mentioned.size > 0) {
      setVisibility((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(LAYER_META) as (keyof Visibility)[]) {
          next[key] = mentioned.has(key);
        }
        return next;
      });
    }

    const fc = !explain ? result?.geojson : null;
    if (fc?.features?.length) {
      setShowQueryOnMap(true);
      requestAnimationFrame(() => {
        const map = mapRef.current;
        if (!map) return;
        ensureUserQueryOverlay(map, fc);
        const bounds = new maplibregl.LngLatBounds();
        for (const feature of fc.features) {
          if (!feature.geometry || feature.geometry.type === "GeometryCollection") continue;
          flattenCoords(feature.geometry.coordinates).forEach(([lng, lat]) =>
            bounds.extend([lng, lat])
          );
        }
        if (!bounds.isEmpty()) {
          map.fitBounds(bounds as LngLatBoundsLike, {
            padding: 56,
            maxZoom: 16,
            duration: 0,
          });
        }
      });
    } else if (!explain) {
      setShowQueryOnMap(false);
    }
  };

  const applyDocument = (next: QueryDoc, patternId: string | null = null) => {
    setQueryDoc({ ...next, savedSql: next.sql });
    setPendingReplace(null);
    setActivePatternId(patternId);
    setSqlRun(null);
    setSqlError(null);
    setTaskTab("query");
  };

  const requestReplace = (next: QueryDoc) => {
    if (queryDoc && queryDoc.sql !== queryDoc.savedSql) {
      setPendingReplace(next);
      setActivePatternId(null);
      setTaskTab("query");
      return;
    }
    applyDocument(next, null);
  };

  const openPattern = (id: string) => {
    const p = PATTERNS.find((x) => x.id === id);
    if (!p) return;
    const next = makeDoc(p.title, p.sql.trim());
    if (queryDoc && queryDoc.sql !== queryDoc.savedSql) {
      setPendingReplace(next);
      setActivePatternId(id);
      return;
    }
    applyDocument(next, id);
  };

  const insertIntoSql = (token: string) => {
    setQueryDoc((d) => {
      if (!d) {
        const isTable = SCHEMA_TABLES.some((t) => t.table === token);
        const sql = isTable
          ? `SELECT id, name, district_id,\n  ST_AsGeoJSON(ST_Transform(geom, 4326))::json AS geometry\nFROM ${token}\nORDER BY id\nLIMIT 50`
          : `SELECT ${token}\nFROM bike_parking\nLIMIT 50`;
        return makeDoc(isTable ? token : "Scratch", sql);
      }
      const sql = d.sql;
      const trimmed = sql.trimEnd();
      const next = /[,(]$|\s$|\($/.test(trimmed)
        ? `${sql}${token}`
        : `${sql}${sql.endsWith("\n") ? "" : " "}${token}`;
      return { ...d, sql: next };
    });
    setActivePatternId(null);
  };

  const openReferenceFile = async () => {
    if (!activePattern?.refFile) return;
    try {
      const file = await api.sqlFile(activePattern.refFile);
      applyDocument(makeDoc(titleForSqlFile(file.name), file.sql, { filename: file.name }), null);
    } catch (err) {
      setSqlError(err instanceof Error ? err.message : "Could not load SQL file");
    }
  };

  const inspectLayerSql = async (key: keyof Visibility) => {
    const name = LAYER_SQL_REF[key];
    if (!name) return;
    try {
      setLayerError(null);
      const file = await api.sqlFile(name);
      const catalog = layers.find((l) => l.slug === key);
      setVisibility((v) => ({ ...v, [key]: true }));
      requestReplace(
        makeDoc(LAYER_META[key].label, file.sql, {
          filename: file.name,
          caveat: catalog?.coverage_caveat,
        })
      );
    } catch (err) {
      setLayerError(err instanceof Error ? err.message : "Could not load SQL");
    }
  };

  const showNearestQuery = () => {
    if (!sqlOffer) return;
    requestReplace(sqlOffer);
  };

  const clearPin = () => {
    markerRef.current?.remove();
    markerRef.current = null;
    setNearest(null);
    setNearestError(null);
    setSqlOffer(null);
    setStatus("Click the map to find nearby amenities");
  };

  useEffect(() => {
    if (taskTab !== "compare" || schoolGreen) return;
    let cancelled = false;
    api
      .schoolGreenProximity()
      .then((res) => {
        if (!cancelled) setSchoolGreen(res);
      })
      .catch(() => {
        if (!cancelled) {
          setSchoolGreen({
            id: "school-green-proximity",
            title: "School-to-green proximity",
            inputs: [],
            operation: "",
            units: {},
            crs: "EPSG:25833",
            caveat: "Could not load school–park proximity for this session.",
            results: [],
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [taskTab, schoolGreen]);

  const runDocument = async (explain: boolean) => {
    if (!queryDoc) return;
    setSqlBusy(true);
    setSqlError(null);
    try {
      const sql = fillBindsFromMap(queryDoc.sql, getBindValues());
      const result = await api.runSql(sql, explain);
      setSqlRun(result);
      applyQueryToMap(queryDoc.sql, result, explain);
    } catch (err) {
      setSqlError(err instanceof Error ? err.message : "Query failed");
      setSqlRun(null);
      setShowQueryOnMap(false);
    } finally {
      setSqlBusy(false);
    }
  };

  const visibleLegendKeys = (Object.keys(LAYER_META) as (keyof Visibility)[]).filter((key) => {
    if (!visibility[key]) return false;
    if (key === "trees" && !treesZoomOk) return false;
    return true;
  });

  return (
    <div
      className={`app${draggingSplit ? " app-resizing" : ""}`}
      ref={appRef}
      style={{ ["--panel-pct" as string]: `${panelPct}%` }}
    >
      <aside className={`panel panel-tab-${taskTab}`}>
        <header className="panel-chrome">
          <div className="panel-chrome-row">
            <h1 className="brand">Berlin Amenities</h1>
            <button
              type="button"
              className="context-borough"
              onClick={() => selectBorough("")}
              title="Clear borough filter"
            >
              {selectedDistrictName ?? "All boroughs"}
            </button>
          </div>
          <div className="layer-grid" role="group" aria-label="Layers">
            {(Object.keys(LAYER_META) as (keyof Visibility)[]).map((key) => {
              const count = layerCounts[key];
              const waitingTrees = key === "trees" && treesNeedZoom;
              const on = visibility[key];
              return (
                <div key={key} className={`layer-chip${on ? " layer-chip-on" : ""}`}>
                  <button
                    type="button"
                    className="layer-chip-toggle"
                    aria-pressed={on}
                    title={waitingTrees ? `Zoom to ${TREES_MIN_ZOOM}` : LAYER_META[key].label}
                    onClick={() => setVisibility((v) => ({ ...v, [key]: !v[key] }))}
                  >
                    <span
                      className={`swatch swatch-${LAYER_META[key].kind}`}
                      style={{ background: LAYER_META[key].swatch }}
                    />
                    <span className="layer-chip-label">{LAYER_META[key].label}</span>
                    {waitingTrees ? (
                      <span className="layer-count">z{TREES_MIN_ZOOM}</span>
                    ) : count != null ? (
                      <span className="layer-count">{count}</span>
                    ) : null}
                  </button>
                  {LAYER_SQL_REF[key] && (
                    <button
                      type="button"
                      className="layer-chip-sql"
                      title={`Open ${key} SQL`}
                      onClick={() => void inspectLayerSql(key)}
                    >
                      SQL
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {layerError && <p className="error">Layer error: {layerError}</p>}
        </header>

        <div className="task-slot">
          <div className="task-tabs" role="tablist" aria-label="Data pane tasks">
            {(
              [
                ["nearby", "Nearby"],
                ["compare", "Compare"],
                ["query", "Query"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`tab-${id}`}
                aria-selected={taskTab === id}
                aria-controls={`panel-${id}`}
                className={`task-tab${taskTab === id ? " task-tab-active" : ""}`}
                onClick={() => setTaskTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {taskTab === "nearby" && (
            <div className="task-panel" role="tabpanel" id="panel-nearby" aria-labelledby="tab-nearby">
              {nearestError && <p className="error">{nearestError}</p>}
              {!nearest && !nearestError && (
                <p className="hint">Click the map to look up nearest amenities.</p>
              )}
              {nearest && (
                <NearestPanel
                  result={nearest}
                  onClear={clearPin}
                  onShowQuery={sqlOffer ? showNearestQuery : undefined}
                />
              )}
            </div>
          )}

          {taskTab === "compare" && (
            <div className="task-panel" role="tabpanel" id="panel-compare" aria-labelledby="tab-compare">
              <ComparePanel
                measure={compareMeasure}
                onMeasureChange={setCompareMeasure}
                density={density}
                greenBorough={greenBorough}
                schoolGreen={schoolGreen}
                selectedDistrict={selectedDistrict}
                onSelectBorough={selectBorough}
                  onShowQuery={(doc) => {
                  const keys = COMPARE_MEASURE_LAYERS[compareMeasure];
                  setVisibility((v) => {
                    const next = { ...v };
                    for (const key of keys) next[key] = true;
                    return next;
                  });
                  requestReplace(doc);
                }}
              />
            </div>
          )}

          {taskTab === "query" && (
            <div
              className="task-panel query-grid"
              role="tabpanel"
              id="panel-query"
              aria-labelledby="tab-query"
            >
              {(sqlOffer &&
                (!queryDoc ||
                  queryDoc.filename !== sqlOffer.filename ||
                  queryDoc.sql !== sqlOffer.sql)) ||
              pendingReplace ? (
                <div className="query-alerts">
                  {sqlOffer &&
                    (!queryDoc ||
                      queryDoc.filename !== sqlOffer.filename ||
                      queryDoc.sql !== sqlOffer.sql) && (
                      <div className="sql-offer">
                        <span>Nearest query ready</span>
                        <button
                          type="button"
                          className="secondary starter-btn"
                          onClick={showNearestQuery}
                        >
                          Open
                        </button>
                      </div>
                    )}
                  {pendingReplace && (
                    <div className="sql-replace-confirm">
                      <span>Replace edited SQL?</span>
                      <div className="nearby-actions">
                        <button
                          type="button"
                          className="starter-btn"
                          onClick={() => applyDocument(pendingReplace, activePatternId)}
                        >
                          Replace
                        </button>
                        <button
                          type="button"
                          className="secondary starter-btn"
                          onClick={() => setPendingReplace(null)}
                        >
                          Keep
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              <div className="query-nav">
                <div className="query-patterns" aria-label="Patterns">
                  {PATTERNS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`pattern-chip${activePatternId === p.id ? " pattern-chip-active" : ""}`}
                      title={p.blurb}
                      onClick={() => openPattern(p.id)}
                    >
                      {p.title}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`pattern-chip pattern-chip-meta${glossaryOpen ? " pattern-chip-active" : ""}`}
                    aria-pressed={glossaryOpen}
                    onClick={() => setGlossaryOpen((o) => !o)}
                  >
                    Glossary
                  </button>
                </div>
              </div>

              <div className="query-main">
                <div className="query-doc-head">
                  <h3 className="query-doc-title">{queryDoc?.title ?? "SQL"}</h3>
                  {queryDirty && <span className="query-doc-dirty">Edited</span>}
                  {queryBinds.length > 0 && (
                    <span className="bind-inline" title="Filled from map at Run">
                      {queryBinds.map((k) => `:${k}`).join(" ")}
                    </span>
                  )}
                </div>
                {activePattern && <p className="query-analyze">{activePattern.analyze}</p>}
                <textarea
                  className="sql-editor"
                  value={queryDoc?.sql ?? ""}
                  placeholder="Pick a pattern, or write SELECT …"
                  onChange={(e) => {
                    const sql = e.target.value;
                    setActivePatternId(null);
                    setQueryDoc((d) => (d ? { ...d, sql } : makeDoc("Scratch", sql)));
                  }}
                  spellCheck={false}
                  aria-label="SQL editor"
                />
                <div className="sql-actions">
                  <button
                    type="button"
                    disabled={sqlBusy || !queryDoc?.sql.trim()}
                    onClick={() => void runDocument(false)}
                  >
                    Run
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={sqlBusy || !queryDoc?.sql.trim()}
                    onClick={() => void runDocument(true)}
                  >
                    Explain
                  </button>
                  {activePattern?.refFile && (
                    <button
                      type="button"
                      className="secondary"
                      disabled={sqlBusy}
                      onClick={() => void openReferenceFile()}
                    >
                      App file
                    </button>
                  )}
                  {sqlRun?.geojson?.features?.length ? (
                    <label className="layer-check">
                      <input
                        type="checkbox"
                        checked={showQueryOnMap}
                        onChange={(e) => setShowQueryOnMap(e.target.checked)}
                      />
                      Map
                    </label>
                  ) : null}
                </div>
                {sqlError && <p className="error">{sqlError}</p>}
              </div>

              <div className="query-results">
                {sqlRun ? <SqlResultPanel result={sqlRun} /> : <p className="hint">Results appear here.</p>}
              </div>
            </div>
          )}
        </div>
      </aside>
      <div
        className="split-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize data pane"
        aria-valuemin={20}
        aria-valuemax={80}
        aria-valuenow={Math.round(panelPct)}
        tabIndex={0}
        onPointerDown={(e) => {
          e.preventDefault();
          setDraggingSplit(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            setPanelPct((p) => Math.max(20, p - 2));
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            setPanelPct((p) => Math.min(80, p + 2));
          } else if (e.key === "Home") {
            e.preventDefault();
            setPanelPct(36);
          }
        }}
      />
      <div className="map-wrap">
        <div className="map" ref={mapNode} />
        <div className="map-chip">Berlin open data · distances in metres (EPSG:25833)</div>
        {(visibleLegendKeys.length > 0 || (showQueryOnMap && sqlRun?.geojson?.features?.length)) && (
          <div className="legend" aria-label="Map legend">
            <div className="legend-title">Legend</div>
            {visibleLegendKeys.map((key) => (
              <div className="legend-row" key={key}>
                <span
                  className={`swatch swatch-${LAYER_META[key].kind}`}
                  style={{
                    background: LAYER_META[key].swatch,
                    opacity: LAYER_META[key].kind === "fill" ? 0.7 : 1,
                  }}
                />
                {LAYER_META[key].label}
              </div>
            ))}
            {showQueryOnMap && sqlRun?.geojson?.features?.length ? (
              <div className="legend-row">
                <span className="swatch swatch-dot" style={{ background: "#c45c26" }} />
                {queryDoc?.title ?? "Query result"}
              </div>
            ) : null}
          </div>
        )}
        <div className="status">{status}</div>
      </div>
      {glossaryOpen && (
        <GlossaryDialog
          tables={SCHEMA_TABLES}
          highlight={activePattern?.tables ?? []}
          onInsert={insertIntoSql}
          onClose={() => setGlossaryOpen(false)}
        />
      )}
    </div>
  );
}

function NearestPanel({
  result,
  onClear,
  onShowQuery,
}: {
  result: NearestAmenities;
  onClear: () => void;
  onShowQuery?: () => void;
}) {
  const hits = [...(result.nearest ?? [])].sort((a, b) => a.distance_m - b.distance_m);
  const maxDist = hits.length > 0 ? Math.max(...hits.map((h) => h.distance_m), 1) : 1;

  return (
    <div className="analysis-card nearby-card">
      <div className="nearby-head">
        <h3 className="nearby-title">Nearest</h3>
        <div className="nearby-actions">
          {onShowQuery && (
            <button type="button" className="secondary starter-btn" onClick={onShowQuery}>
              SQL
            </button>
          )}
          <button type="button" className="secondary starter-btn" onClick={onClear}>
            Clear
          </button>
        </div>
      </div>
      {hits.length > 0 ? (
        <ul className="hit-list hit-list-bars">
          {hits.map((n, i) => (
            <li key={`${n.layer}-${i}`}>
              <div className="hit-meta">
                <span>
                  {LAYER_LABELS[n.layer] ?? n.layer}
                  {n.name ? ` — ${n.name}` : ""}
                </span>
                <span className="hit-dist">{n.distance_m.toFixed(0)} m</span>
              </div>
              <div className="hit-bar-track" aria-hidden="true">
                <span
                  className="hit-bar"
                  style={{ width: `${Math.max(4, (n.distance_m / maxDist) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">No amenity rows yet.</p>
      )}
    </div>
  );
}

function GlossaryDialog({
  tables,
  highlight,
  onInsert,
  onClose,
}: {
  tables: SchemaTable[];
  highlight: string[];
  onInsert: (token: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closing = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.showModal();
    return () => {
      closing.current = true;
      if (el.open) el.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className="glossary-dialog"
      aria-labelledby="glossary-title"
      onClose={() => {
        if (!closing.current) onClose();
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="glossary-dialog-card">
        <header className="glossary-dialog-head">
          <h2 id="glossary-title">Tables</h2>
          <button type="button" className="secondary starter-btn" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="glossary-dialog-body">
          <SchemaGlossary tables={tables} highlight={highlight} onInsert={onInsert} />
        </div>
      </div>
    </dialog>
  );
}

function SchemaGlossary({
  tables,
  highlight = [],
  onInsert,
}: {
  tables: SchemaTable[];
  highlight?: string[];
  onInsert: (token: string) => void;
}) {
  if (!tables.length) return null;
  const hi = new Set(highlight);
  return (
    <dl className="glossary-list">
      {tables.map((t) => (
        <div
          className={`glossary-entry${hi.has(t.table) ? " glossary-entry-hot" : ""}`}
          key={t.table}
        >
          <dt>
            <button
              type="button"
              className="schema-chip schema-chip-table"
              title={`Insert ${t.table}`}
              onClick={() => onInsert(t.table)}
            >
              {t.table}
            </button>
            <span className="glossary-entry-label">{t.label}</span>
          </dt>
          <dd>
            <p className="glossary-about">{t.about}</p>
            <div className="schema-cheat-cols">
              {t.columns.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  className="schema-chip"
                  title={c.note ? `${c.name} (${c.note})` : `Insert ${c.name}`}
                  onClick={() => onInsert(c.name)}
                >
                  <code>{c.name}</code>
                  {c.note && <span className="schema-chip-note">{c.note}</span>}
                </button>
              ))}
            </div>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function SqlResultPanel({ result }: { result: SqlRunResult }) {
  if (result.explain) {
    return (
      <div className="analysis-card">
        <h3>EXPLAIN plan</h3>
        <pre className="sql-pre">{result.plan}</pre>
      </div>
    );
  }
  return (
    <div className="analysis-card">
      <h3>
        Results · {result.row_count}
        {result.truncated ? "+" : ""} rows
        {result.geojson ? ` · ${result.geojson.features.length} map features` : ""}
      </h3>
      {result.columns.length > 0 ? (
        <div className="sql-table-wrap">
          <table className="coverage-table density-table">
            <thead>
              <tr>
                {result.columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.slice(0, 50).map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>{formatCell(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="hint">No rows.</p>
      )}
    </div>
  );
}

function formatCell(cell: unknown): string {
  if (cell == null) return "null";
  if (typeof cell === "object") return JSON.stringify(cell).slice(0, 80);
  return String(cell);
}

type CompareRow = {
  id: number | "";
  name: string;
  value: number | null;
  secondary?: string;
};

function ComparePanel({
  measure,
  onMeasureChange,
  density,
  greenBorough,
  schoolGreen,
  selectedDistrict,
  onSelectBorough,
  onShowQuery,
}: {
  measure: CompareMeasure;
  onMeasureChange: (m: CompareMeasure) => void;
  density: AnalysisResponse | null;
  greenBorough: AnalysisResponse | null;
  schoolGreen: AnalysisResponse | null;
  selectedDistrict: number | "";
  onSelectBorough: (id: number | "") => void;
  onShowQuery: (doc: QueryDoc) => void;
}) {
  const analysis =
    measure === "green_pct" ? greenBorough : measure === "school_park" ? schoolGreen : density;

  const districtIdOf = (r: Record<string, unknown>): number | "" =>
    typeof r.district_id === "number" ? r.district_id : "";

  const rows: CompareRow[] = (() => {
    if (measure === "green_pct") {
      return (greenBorough?.results ?? [])
        .map((r) => ({
          id: districtIdOf(r),
          name: String(r.district_name ?? "—"),
          value: typeof r.pct_of_district_area === "number" ? r.pct_of_district_area : null,
        }))
        .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    }
    if (measure === "school_park") {
      return (schoolGreen?.results ?? [])
        .map((r) => ({
          id: districtIdOf(r),
          name: String(r.district_name ?? "—"),
          value: typeof r.median_m === "number" ? r.median_m : null,
          secondary:
            typeof r.p90_m === "number" ? `p90 ${r.p90_m.toFixed(0)} m` : undefined,
        }))
        .sort((a, b) => (a.value ?? Infinity) - (b.value ?? Infinity));
    }
    const key = measure;
    return (density?.results ?? [])
      .map((r) => ({
        id: districtIdOf(r),
        name: String(r.district_name ?? "—"),
        value: Number(r[key] ?? 0),
      }))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  })();

  const maxValue = Math.max(...rows.map((r) => r.value ?? 0), 1);
  const unit =
    measure === "green_pct" ? "%" : measure === "school_park" ? "m" : "";

  const showQuery = async () => {
    const ref = analysis?.sql_ref;
    if (!ref) return;
    try {
      const file = await api.sqlFile(ref);
      onShowQuery(
        makeDoc(titleForSqlFile(file.name), file.sql, {
          filename: file.name,
          caveat: analysis?.caveat,
        })
      );
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="analysis-card compare-card">
      <div className="compare-controls">
        <label className="compare-measure">
          <span className="sr-only">Measure</span>
          <select
            value={measure}
            onChange={(e) => onMeasureChange(e.target.value as CompareMeasure)}
          >
            {COMPARE_MEASURES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        {analysis?.sql_ref && (
          <button type="button" className="secondary starter-btn" onClick={() => void showQuery()}>
            SQL
          </button>
        )}
      </div>
      <div className="compare-grid">
        <button
          type="button"
          className={`compare-row${!selectedDistrict ? " compare-row-active" : ""}`}
          onClick={() => onSelectBorough("")}
        >
          <span className="compare-name">All boroughs</span>
          <span className="compare-value">Viewport</span>
        </button>
        {!analysis && <p className="hint">Loading…</p>}
        {rows.map((r) => {
          const pct = r.value == null ? 0 : (r.value / maxValue) * 100;
          const label =
            r.value == null
              ? "—"
              : measure === "green_pct"
                ? `${r.value.toFixed(1)}%`
                : measure === "school_park"
                  ? `${r.value.toFixed(0)} m`
                  : String(r.value);
          return (
            <button
              type="button"
              key={r.name}
              className={`compare-row${selectedDistrict === r.id ? " compare-row-active" : ""}`}
              onClick={() => (typeof r.id === "number" ? onSelectBorough(r.id) : onSelectBorough(""))}
            >
              <span className="compare-name">
                {r.name}
                {r.secondary && <span className="compare-secondary">{r.secondary}</span>}
              </span>
              <span className="pct-cell compare-bar">
                <span className="pct-bar" style={{ width: `${Math.min(pct, 100)}%` }} />
                <span className="pct-label">
                  {label}
                  {unit && measure !== "green_pct" && measure !== "school_park" ? ` ${unit}` : ""}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

type SourceStyle = {
  type: "fill" | "circle" | "line";
  paint: Record<string, unknown>;
  outline?: Record<string, unknown>;
  minzoom?: number;
};

function ensureNeighborhoodLabels(map: Map) {
  if (map.getLayer("neighborhoods-label") || !map.getSource("neighborhoods")) return;
  map.addLayer({
    id: "neighborhoods-label",
    type: "symbol",
    source: "neighborhoods",
    minzoom: 11,
    layout: {
      "text-field": ["get", "name"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 11, 11, 14, 14],
      "text-font": ["Noto Sans Regular"],
      "text-max-width": 8,
      "text-padding": 2,
      visibility: "none",
    },
    paint: {
      "text-color": "#3d4f58",
      "text-halo-color": "rgba(252, 252, 250, 0.95)",
      "text-halo-width": 1.4,
      "text-opacity": 0.95,
    },
  } as never);
}

function ensureUserQueryOverlay(map: Map, data: FeatureCollection) {
  if (map.getSource("user_query")) {
    (map.getSource("user_query") as maplibregl.GeoJSONSource).setData(data as never);
  } else {
    map.addSource("user_query", { type: "geojson", data: data as never });
  }

  if (!map.getLayer("user_query-fill")) {
    map.addLayer({
      id: "user_query-fill",
      type: "fill",
      source: "user_query",
      filter: [
        "any",
        ["==", ["geometry-type"], "Polygon"],
        ["==", ["geometry-type"], "MultiPolygon"],
      ],
      paint: { "fill-color": "#c45c26", "fill-opacity": 0.35 },
    } as never);
  }
  if (!map.getLayer("user_query-outline")) {
    map.addLayer({
      id: "user_query-outline",
      type: "line",
      source: "user_query",
      filter: [
        "any",
        ["==", ["geometry-type"], "Polygon"],
        ["==", ["geometry-type"], "MultiPolygon"],
        ["==", ["geometry-type"], "LineString"],
        ["==", ["geometry-type"], "MultiLineString"],
      ],
      paint: { "line-color": "#8a3a12", "line-width": 1.4 },
    } as never);
  }
  if (!map.getLayer("user_query-circle")) {
    map.addLayer({
      id: "user_query-circle",
      type: "circle",
      source: "user_query",
      filter: [
        "any",
        ["==", ["geometry-type"], "Point"],
        ["==", ["geometry-type"], "MultiPoint"],
      ],
      paint: {
        "circle-radius": 6,
        "circle-color": "#c45c26",
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#fff",
        "circle-opacity": 0.95,
      },
    } as never);
  }
  for (const id of ["user_query-fill", "user_query-outline", "user_query-circle"]) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "visible");
  }
}

function ensureSource(map: Map, id: string, data: FeatureCollection, style: SourceStyle) {
  if (map.getSource(id)) {
    (map.getSource(id) as maplibregl.GeoJSONSource).setData(data as never);
    const mainId = style.type === "line" ? `${id}-line` : `${id}-layer`;
    if (map.getLayer(mainId)) {
      for (const [key, value] of Object.entries(style.paint)) {
        map.setPaintProperty(mainId, key, value as never);
      }
    }
    if (style.outline && map.getLayer(`${id}-outline`)) {
      for (const [key, value] of Object.entries(style.outline)) {
        map.setPaintProperty(`${id}-outline`, key, value as never);
      }
    }
    return;
  }

  map.addSource(id, { type: "geojson", data: data as never });

  if (style.type === "line") {
    map.addLayer({
      id: `${id}-line`,
      type: "line",
      source: id,
      paint: style.paint,
      ...(style.minzoom != null ? { minzoom: style.minzoom } : {}),
    } as never);
    return;
  }

  map.addLayer({
    id: `${id}-layer`,
    type: style.type,
    source: id,
    paint: style.paint,
    ...(style.minzoom != null ? { minzoom: style.minzoom } : {}),
  } as never);

  if (style.outline) {
    map.addLayer({
      id: `${id}-outline`,
      type: "line",
      source: id,
      paint: style.outline,
      ...(style.minzoom != null ? { minzoom: style.minzoom } : {}),
    } as never);
  }
}

function flattenCoords(coords: unknown): [number, number][] {
  const out: [number, number][] = [];
  const walk = (node: unknown) => {
    if (!Array.isArray(node)) return;
    if (typeof node[0] === "number" && typeof node[1] === "number") {
      out.push([node[0] as number, node[1] as number]);
      return;
    }
    node.forEach(walk);
  };
  walk(coords);
  return out;
}
