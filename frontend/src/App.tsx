import { useEffect, useRef, useState } from "react";
import maplibregl, { Map, LngLatBoundsLike, Marker } from "maplibre-gl";
import {
  AnalysisResponse,
  BBox,
  DistrictListItem,
  FeatureCollection,
  LayerMeta,
  NearestAmenities,
  api,
  bboxContains,
  boundsToBbox,
  clearApiCache,
  dbg,
  formatBbox,
  padBbox,
} from "./api";

type Visibility = {
  districts: boolean;
  green_spaces: boolean;
  schools: boolean;
  trees: boolean;
  bike_parking: boolean;
  ev_chargers: boolean;
  drinking_fountains: boolean;
  bathing_waters: boolean;
};

const LAYER_META: Record<
  keyof Visibility,
  { label: string; swatch: string; kind: "fill" | "dot" | "line" }
> = {
  districts: { label: "Districts", swatch: "#1f4e79", kind: "line" },
  green_spaces: { label: "Parks", swatch: "#1f8a5b", kind: "fill" },
  schools: { label: "Schools", swatch: "#c45c26", kind: "dot" },
  trees: { label: "Street trees", swatch: "#2f6b3c", kind: "dot" },
  bike_parking: { label: "Bike parking", swatch: "#0f6a5a", kind: "dot" },
  ev_chargers: { label: "EV chargers", swatch: "#1a6fbf", kind: "dot" },
  drinking_fountains: { label: "Drinking fountains", swatch: "#3a7ca5", kind: "dot" },
  bathing_waters: { label: "Bathing waters", swatch: "#0b6e99", kind: "dot" },
};

const LAYER_LABELS: Record<string, string> = {
  trees: "Street tree",
  bike_parking: "Bike parking",
  ev_chargers: "EV charger",
  drinking_fountains: "Drinking fountain",
  bathing_waters: "Bathing water",
  green_spaces: "Park",
};

const BERLIN_CENTER: [number, number] = [13.405, 52.52];
const BBOX_PAD = 0.6;
const MOVE_DEBOUNCE_MS = 250;
const TREE_MIN_ZOOM = 14;

export default function App() {
  const mapRef = useRef<Map | null>(null);
  const mapNode = useRef<HTMLDivElement | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const loadedExtentRef = useRef<BBox | null>(null);
  const loadedDistrictRef = useRef<number | "">("");
  const loadSeqRef = useRef(0);
  const densityLoadedRef = useRef(false);

  const [layers, setLayers] = useState<LayerMeta[]>([]);
  const [districts, setDistricts] = useState<DistrictListItem[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState<number | "">("");
  const [visibility, setVisibility] = useState<Visibility>({
    districts: true,
    green_spaces: false,
    schools: false,
    trees: false,
    bike_parking: true,
    ev_chargers: true,
    drinking_fountains: true,
    bathing_waters: true,
  });
  const visibilityRef = useRef(visibility);
  visibilityRef.current = visibility;
  const [status, setStatus] = useState("Loading map…");
  const [error, setError] = useState<string | null>(null);
  const [nearest, setNearest] = useState<NearestAmenities | null>(null);
  const [density, setDensity] = useState<AnalysisResponse | null>(null);
  const [greenBorough, setGreenBorough] = useState<AnalysisResponse | null>(null);

  useEffect(() => {
    if (!mapNode.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapNode.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
      center: BERLIN_CENTER,
      zoom: 11,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRef.current = map;
    map.on("load", () => setStatus("Click the map to find nearby amenities"));

    const onClick = async (e: maplibregl.MapMouseEvent) => {
      const { lng, lat } = e.lngLat;
      if (markerRef.current) markerRef.current.remove();
      markerRef.current = new maplibregl.Marker({ color: "#1f5c4d" }).setLngLat([lng, lat]).addTo(map);
      try {
        setError(null);
        setStatus(`Looking up ${lng.toFixed(5)}, ${lat.toFixed(5)}…`);
        const result = await api.nearestAmenities(lng, lat);
        setNearest(result);
        const closest = result.nearest?.[0];
        setStatus(
          closest
            ? `Nearest: ${LAYER_LABELS[closest.layer] ?? closest.layer} at ${closest.distance_m.toFixed(0)} m`
            : "No amenities loaded yet — run the import script"
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Lookup failed");
        setStatus("Lookup failed");
      }
    };
    map.on("click", onClick);

    return () => {
      map.off("click", onClick);
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
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const applyVisibility = () => {
      (Object.keys(visibilityRef.current) as (keyof Visibility)[]).forEach((key) => {
        const visible = visibilityRef.current[key] ? "visible" : "none";
        for (const suffix of ["-layer", "-outline", "-line"]) {
          const layerId = `${key}${suffix}`;
          if (map.getLayer(layerId)) {
            map.setLayoutProperty(layerId, "visibility", visible);
          }
        }
      });
    };

    const loadLayers = async (force: boolean) => {
      const districtId = selectedDistrict === "" ? undefined : selectedDistrict;
      const viewport = boundsToBbox(map.getBounds());

      if (districtId != null) {
        if (!force && loadedDistrictRef.current === selectedDistrict) return;
      } else {
        if (
          !force &&
          loadedExtentRef.current &&
          bboxContains(loadedExtentRef.current, viewport)
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
        setError(null);
        setStatus("Loading layers…");

        const treePromise =
          districtId != null || (fetchBbox && map.getZoom() >= TREE_MIN_ZOOM - 1)
            ? api.trees(fetchBbox, districtId)
            : Promise.resolve({ type: "FeatureCollection", features: [] } as FeatureCollection);

        const [districtFc, greenFc, schoolFc, treeFc, bikeFc, evFc, fountainFc, bathingFc, dens, green] =
          await Promise.all([
            api.districts(),
            api.greenSpaces(fetchBbox, districtId),
            api.schools(fetchBbox, districtId),
            treePromise,
            api.bikeParking(fetchBbox, districtId),
            api.evChargers(fetchBbox, districtId),
            api.drinkingFountains(fetchBbox, districtId),
            api.bathingWaters(fetchBbox, districtId),
            densityLoadedRef.current
              ? Promise.resolve(null as AnalysisResponse | null)
              : api.amenityDensityByBorough(),
            densityLoadedRef.current
              ? Promise.resolve(null as AnalysisResponse | null)
              : api.greenByBorough(),
          ]);

        if (seq !== loadSeqRef.current) return;

        // #region agent log
        {
          const ringLen = (fc: FeatureCollection) =>
            fc.features.slice(0, 4).map((f) => {
              const g = f.geometry;
              const c = g.coordinates as unknown[][];
              const ring =
                g.type === "MultiPolygon" ? (c[0]?.[0] as unknown[]) : (c[0] as unknown[]);
              return {
                name: (f.properties?.name as string) ?? null,
                type: g.type,
                ringPts: Array.isArray(ring) ? ring.length : 0,
              };
            });
          dbg("D", "App.tsx:loadLayers", "about to set map sources", {
            visibility: { ...visibilityRef.current },
            zoom: map.getZoom(),
            districts: { n: districtFc.features.length, samples: ringLen(districtFc) },
            green: { n: greenFc.features.length, samples: ringLen(greenFc) },
            mapHasDistrictsSource: Boolean(map.getSource("districts")),
            mapHasGreenSource: Boolean(map.getSource("green_spaces")),
          });
        }
        // #endregion

        if (dens) {
          setDensity(dens);
          densityLoadedRef.current = true;
        }
        if (green) setGreenBorough(green);

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
        ensureSource(map, "schools", schoolFc, {
          type: "circle",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 3, 16, 7] as never,
            "circle-color": "#c45c26",
            "circle-stroke-width": 1,
            "circle-stroke-color": "#fff",
            "circle-opacity": 0.9,
          },
          minzoom: 12,
        });
        ensureSource(map, "trees", treeFc, {
          type: "circle",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 14, 2, 17, 5] as never,
            "circle-color": "#2f6b3c",
            "circle-stroke-width": 0.5,
            "circle-stroke-color": "#fff",
            "circle-opacity": 0.75,
          },
          minzoom: TREE_MIN_ZOOM,
        });
        ensureSource(map, "bike_parking", bikeFc, {
          type: "circle",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 3, 16, 7] as never,
            "circle-color": "#0f6a5a",
            "circle-stroke-width": 1,
            "circle-stroke-color": "#fff",
            "circle-opacity": 0.9,
          },
          minzoom: 11,
        });
        ensureSource(map, "ev_chargers", evFc, {
          type: "circle",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 3, 16, 7] as never,
            "circle-color": "#1a6fbf",
            "circle-stroke-width": 1,
            "circle-stroke-color": "#fff",
            "circle-opacity": 0.9,
          },
          minzoom: 11,
        });
        ensureSource(map, "drinking_fountains", fountainFc, {
          type: "circle",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 4, 16, 8] as never,
            "circle-color": "#3a7ca5",
            "circle-stroke-width": 1,
            "circle-stroke-color": "#fff",
            "circle-opacity": 0.95,
          },
          minzoom: 11,
        });
        ensureSource(map, "bathing_waters", bathingFc, {
          type: "circle",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 5, 14, 9] as never,
            "circle-color": "#0b6e99",
            "circle-stroke-width": 1.2,
            "circle-stroke-color": "#fff",
            "circle-opacity": 0.95,
          },
        });
        ensureSource(map, "districts", districtFc, {
          type: "line",
          paint: {
            "line-color": "#102a43",
            "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2.4, 13, 4] as never,
            "line-opacity": 0.95,
          },
        });
        if (map.getLayer("districts-line")) {
          map.moveLayer("districts-line");
        }

        // #region agent log
        dbg("F", "App.tsx:loadLayers", "layer order after moveLayer", {
          runId: "post-fix",
          layers: map.getStyle().layers?.map((l) => l.id) ?? [],
          districtsRingPts: districtFc.features.slice(0, 3).map((f) => {
            const g = f.geometry;
            const c = g.coordinates as unknown[][];
            const ring = g.type === "MultiPolygon" ? (c[0]?.[0] as unknown[]) : (c[0] as unknown[]);
            return Array.isArray(ring) ? ring.length : 0;
          }),
        });
        // #endregion

        applyVisibility();
        loadedExtentRef.current = extentToStore;
        loadedDistrictRef.current = selectedDistrict;

        setStatus(
          `Loaded parks ${greenFc.features.length}, bikes ${bikeFc.features.length}, ` +
            `EV ${evFc.features.length}, fountains ${fountainFc.features.length}, ` +
            `bathing ${bathingFc.features.length}, trees ${treeFc.features.length}`
        );
      } catch (err) {
        if (seq !== loadSeqRef.current) return;
        setError(err instanceof Error ? err.message : "Failed to load layers");
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
      if (selectedDistrict !== "") return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void loadLayers(false);
      }, MOVE_DEBOUNCE_MS);
    };
    map.on("moveend", onMoveEnd);

    return () => {
      map.off("moveend", onMoveEnd);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [selectedDistrict]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    (Object.keys(visibility) as (keyof Visibility)[]).forEach((key) => {
      const visible = visibility[key] ? "visible" : "none";
      for (const suffix of ["-layer", "-outline", "-line"]) {
        const layerId = `${key}${suffix}`;
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, "visibility", visible);
        }
      }
    });
  }, [visibility]);

  const focusDistrict = () => {
    const map = mapRef.current;
    if (!map || selectedDistrict === "") return;
    const src = map.getSource("districts") as maplibregl.GeoJSONSource | undefined;
    const data = (src as unknown as { _data?: FeatureCollection })?._data;
    const feature = data?.features?.find((f) => f.properties?.id === selectedDistrict);
    if (!feature || feature.geometry.type === "GeometryCollection") return;
    const bounds = new maplibregl.LngLatBounds();
    flattenCoords(feature.geometry.coordinates).forEach(([lng, lat]) => bounds.extend([lng, lat]));
    if (!bounds.isEmpty()) map.fitBounds(bounds as LngLatBoundsLike, { padding: 48, duration: 0 });
  };

  return (
    <div className="app">
      <aside className="panel">
        <h1 className="brand">Berlin Amenities Map</h1>
        <p className="lede">
          Dark outlines are the 12 Bezirke (boroughs), not neighborhood labels like Prenzlauer Berg.
          Click the map for nearby amenities.
        </p>
        <p className="hint">Turn on Parks when you want green fill — it stays off by default so borough borders stay clear.</p>

        <div className="section">
          <h2>Layers</h2>
          <p className="hint">Street trees load at higher zoom (or with a borough filter).</p>
          {(Object.keys(LAYER_META) as (keyof Visibility)[]).map((key) => (
            <label className="layer-row" key={key}>
              <input
                type="checkbox"
                checked={visibility[key]}
                onChange={() => setVisibility((v) => ({ ...v, [key]: !v[key] }))}
              />
              <span className={`swatch swatch-${LAYER_META[key].kind}`} style={{ background: LAYER_META[key].swatch }} />
              {LAYER_META[key].label}
            </label>
          ))}
        </div>

        <div className="section">
          <h2>Borough focus</h2>
          <select
            value={selectedDistrict}
            onChange={(e) => setSelectedDistrict(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">All boroughs (viewport)</option>
            {districts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <div style={{ marginTop: "0.5rem" }}>
            <button type="button" className="secondary" onClick={focusDistrict} disabled={selectedDistrict === ""}>
              Focus map
            </button>
          </div>
        </div>

        <div className="section">
          <h2>Nearest amenities</h2>
          {!nearest && <p className="empty">Click the map to look up distances.</p>}
          {nearest && <NearestPanel result={nearest} />}
        </div>

        <div className="section">
          <h2>Amenity counts by borough</h2>
          {density && <DensityTable analysis={density} />}
        </div>

        <div className="section">
          <h2>Green cover by borough</h2>
          {greenBorough && <GreenTable analysis={greenBorough} />}
        </div>

        <details className="section provenance-fold">
          <summary>Data provenance</summary>
          {layers.length === 0 && <p className="empty">No catalog rows yet — run the import script.</p>}
          {layers.map((l) => (
            <div className="analysis-card" key={l.slug}>
              <h3>{l.name}</h3>
              <div>Imported: {l.imported_at ?? "—"}</div>
              <div>CRS: EPSG:{l.srid}</div>
              {l.license_text && <div>License: {l.license_text}</div>}
              {l.coverage_caveat && <div className="caveat">{l.coverage_caveat}</div>}
            </div>
          ))}
        </details>

        {error && <p className="error">API error: {error}</p>}
      </aside>
      <div className="map-wrap">
        <div className="map" ref={mapNode} />
        <div className="map-chip">Berlin open data · distances in metres (EPSG:25833)</div>
        <div className="legend" aria-label="Map legend">
          <div className="legend-title">Legend</div>
          <div className="legend-row">
            <span className="swatch swatch-fill" style={{ background: "#2f855a", opacity: 0.7 }} />
            Park
          </div>
          <div className="legend-row">
            <span className="swatch swatch-dot" style={{ background: "#0f6a5a" }} />
            Bike parking
          </div>
          <div className="legend-row">
            <span className="swatch swatch-dot" style={{ background: "#1a6fbf" }} />
            EV charger
          </div>
          <div className="legend-row">
            <span className="swatch swatch-dot" style={{ background: "#3a7ca5" }} />
            Fountain
          </div>
          <div className="legend-row">
            <span className="swatch swatch-dot" style={{ background: "#0b6e99" }} />
            Bathing water
          </div>
          <div className="legend-row">
            <span className="swatch swatch-dot" style={{ background: "#2f6b3c" }} />
            Street tree
          </div>
        </div>
        <div className="status">{status}</div>
      </div>
    </div>
  );
}

function NearestPanel({ result }: { result: NearestAmenities }) {
  return (
    <div className="analysis-card">
      <h3>
        {result.lon.toFixed(5)}, {result.lat.toFixed(5)}
      </h3>
      <p className="caveat">{result.caveat}</p>
      {result.nearest?.length > 0 ? (
        <ul className="hit-list">
          {result.nearest.map((n, i) => (
            <li key={`${n.layer}-${i}`}>
              {LAYER_LABELS[n.layer] ?? n.layer}
              {n.name ? ` — ${n.name}` : ""} · {n.distance_m.toFixed(0)} m
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">No amenity rows in the database yet.</p>
      )}
    </div>
  );
}

function DensityTable({ analysis }: { analysis: AnalysisResponse }) {
  const rows = analysis.results.map((r) => ({
    name: String(r.district_name ?? "—"),
    trees: Number(r.trees ?? 0),
    bike: Number(r.bike_parking ?? 0),
    ev: Number(r.ev_chargers ?? 0),
    fountains: Number(r.drinking_fountains ?? 0),
    bathing: Number(r.bathing_waters ?? 0),
  }));

  return (
    <div className="analysis-card">
      <p className="caveat">{analysis.caveat}</p>
      <table className="coverage-table density-table">
        <thead>
          <tr>
            <th>Borough</th>
            <th>Bike</th>
            <th>EV</th>
            <th>H₂O</th>
            <th>Bath</th>
            <th>Trees</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td>{r.bike}</td>
              <td>{r.ev}</td>
              <td>{r.fountains}</td>
              <td>{r.bathing}</td>
              <td>{r.trees}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GreenTable({ analysis }: { analysis: AnalysisResponse }) {
  const rows = analysis.results
    .map((r) => ({
      name: String(r.district_name ?? "—"),
      pct: typeof r.pct_of_district_area === "number" ? r.pct_of_district_area : null,
    }))
    .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));

  return (
    <div className="analysis-card">
      <p className="caveat">{analysis.caveat}</p>
      <table className="coverage-table">
        <thead>
          <tr>
            <th>Borough</th>
            <th>% green</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td>
                <div className="pct-cell">
                  <span className="pct-bar" style={{ width: `${Math.min(r.pct ?? 0, 100)}%` }} />
                  <span className="pct-label">{r.pct == null ? "—" : `${r.pct.toFixed(1)}%`}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type SourceStyle = {
  type: "fill" | "circle" | "line";
  paint: Record<string, unknown>;
  outline?: Record<string, unknown>;
  minzoom?: number;
};

function ensureSource(map: Map, id: string, data: FeatureCollection, style: SourceStyle) {
  // #region agent log
  if (id === "districts" || id === "green_spaces") {
    const first = data.features[0];
    const g = first?.geometry;
    const c = (g?.coordinates ?? []) as unknown[][];
    const ring = g?.type === "MultiPolygon" ? (c[0]?.[0] as unknown[]) : (c[0] as unknown[]);
    dbg("E", "App.tsx:ensureSource", "setData/addSource", {
      id,
      updatingExisting: Boolean(map.getSource(id)),
      featureCount: data.features.length,
      firstName: first?.properties?.name ?? null,
      firstRingPts: Array.isArray(ring) ? ring.length : 0,
      styleType: style.type,
    });
  }
  // #endregion
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
