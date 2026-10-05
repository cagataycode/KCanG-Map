import { useEffect, useRef, useState } from "react";
import maplibregl, { Map, LngLatBoundsLike, Marker } from "maplibre-gl";
import {
  AnalysisResponse,
  BBox,
  ConsumptionCheck,
  DistrictListItem,
  FeatureCollection,
  LayerMeta,
  api,
  bboxContains,
  boundsToBbox,
  formatBbox,
  padBbox,
} from "./api";

type Visibility = {
  districts: boolean;
  restriction_buffers: boolean;
  schools: boolean;
  playgrounds: boolean;
  kitas: boolean;
  sports_facilities: boolean;
  green_spaces: boolean;
};

const LAYER_META: Record<
  keyof Visibility,
  { label: string; swatch: string; kind: "fill" | "dot" | "line" }
> = {
  districts: { label: "Districts", swatch: "#1f4e79", kind: "line" },
  restriction_buffers: { label: "100 m buffers", swatch: "#c45c5c", kind: "fill" },
  schools: { label: "Schools", swatch: "#c45c26", kind: "dot" },
  playgrounds: { label: "Playgrounds", swatch: "#b8860b", kind: "dot" },
  kitas: { label: "Kitas", swatch: "#5b4fc7", kind: "dot" },
  sports_facilities: { label: "Sports", swatch: "#0f6a5a", kind: "dot" },
  green_spaces: { label: "Parks (context)", swatch: "#1f8a5b", kind: "fill" },
};

const BERLIN_CENTER: [number, number] = [13.405, 52.52];
const BBOX_PAD = 0.6;
const MOVE_DEBOUNCE_MS = 250;

const DISCLAIMER_SHORT =
  "Not legal advice · 100 m geometry buffers ≈ § 5 Sichtweite · incomplete data · minors & Fußgängerzonen unmapped";

const DISCLAIMER =
  "Not legal advice. 100 m buffers approximate § 5 KCanG Sichtweite from facility geometry (not surveyed entrances). Incomplete inventories; presence of minors cannot be mapped; Fußgängerzonen 07:00–20:00 are not modeled. Outside mapped buffers ≠ allowed.";

export default function App() {
  const mapRef = useRef<Map | null>(null);
  const mapNode = useRef<HTMLDivElement | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const loadedExtentRef = useRef<BBox | null>(null);
  const loadedDistrictRef = useRef<number | "">("");
  const loadSeqRef = useRef(0);
  const coverageLoadedRef = useRef(false);

  const [layers, setLayers] = useState<LayerMeta[]>([]);
  const [districts, setDistricts] = useState<DistrictListItem[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState<number | "">("");
  const [visibility, setVisibility] = useState<Visibility>({
    districts: true,
    restriction_buffers: true,
    schools: false,
    playgrounds: false,
    kitas: false,
    sports_facilities: false,
    green_spaces: false,
  });
  const visibilityRef = useRef(visibility);
  visibilityRef.current = visibility;
  const [status, setStatus] = useState("Loading map…");
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<ConsumptionCheck | null>(null);
  const [coverage, setCoverage] = useState<AnalysisResponse | null>(null);

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
    map.on("load", () => setStatus("Click the map to check a point"));

    const onClick = async (e: maplibregl.MapMouseEvent) => {
      const { lng, lat } = e.lngLat;
      if (markerRef.current) markerRef.current.remove();
      markerRef.current = new maplibregl.Marker({ color: "#8a1c1c" }).setLngLat([lng, lat]).addTo(map);
      try {
        setError(null);
        setStatus(`Checking ${lng.toFixed(5)}, ${lat.toFixed(5)}…`);
        const result = await api.consumptionCheck(lng, lat);
        setCheck(result);
        setStatus(
          result.status === "likely_restricted"
            ? "Point is inside a mapped 100 m restriction buffer"
            : result.status === "outside_mapped_buffers"
              ? "Point is outside mapped buffers (not a legal clearance)"
              : "No restriction buffers loaded"
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Check failed");
        setStatus("Check failed");
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

      // Borough mode: one fetch per district; pan does not refetch.
      if (districtId != null) {
        if (!force && loadedDistrictRef.current === selectedDistrict) return;
      } else {
        // Citywide: only refetch when viewport leaves the last padded extent.
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

        const [districtFc, bufferFc, schoolFc, playFc, kitaFc, sportFc, greenFc, cov] =
          await Promise.all([
            api.districts(),
            api.restrictionBuffers(fetchBbox, districtId),
            api.schools(fetchBbox, districtId),
            api.playgrounds(fetchBbox, districtId),
            api.kitas(fetchBbox, districtId),
            api.sportsFacilities(fetchBbox, districtId),
            api.greenSpaces(fetchBbox, districtId),
            coverageLoadedRef.current
              ? Promise.resolve(null as AnalysisResponse | null)
              : api.restrictionCoverage(),
          ]);

        if (seq !== loadSeqRef.current) return;

        if (cov) {
          setCoverage(cov);
          coverageLoadedRef.current = true;
        }

        ensureSource(map, "districts", districtFc, {
          type: "line",
          paint: {
            "line-color": "#1f3348",
            "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2.2, 13, 3.5] as never,
            "line-opacity": 0.9,
          },
        });
        // Soft fill + outline so overlaps do not become opaque mud.
        ensureSource(map, "restriction_buffers", bufferFc, {
          type: "fill",
          paint: {
            "fill-color": "#c45c5c",
            "fill-opacity": ["interpolate", ["linear"], ["zoom"], 10, 0.08, 14, 0.16] as never,
          },
          outline: {
            "line-color": "#9b2c2c",
            "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.4, 14, 1.2] as never,
            "line-opacity": 0.55,
          },
        });
        ensureSource(map, "green_spaces", greenFc, {
          type: "fill",
          paint: {
            "fill-color": "#2f855a",
            "fill-opacity": 0.18,
          },
          outline: {
            "line-color": "#276749",
            "line-width": 0.8,
            "line-opacity": 0.5,
          },
        });
        ensureSource(map, "playgrounds", playFc, {
          type: "fill",
          paint: {
            "fill-color": "#b8860b",
            "fill-opacity": 0.35,
          },
          minzoom: 13,
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
        ensureSource(map, "kitas", kitaFc, {
          type: "circle",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 3, 16, 7] as never,
            "circle-color": "#5b4fc7",
            "circle-stroke-width": 1,
            "circle-stroke-color": "#fff",
            "circle-opacity": 0.85,
          },
          minzoom: 12,
        });
        ensureSource(map, "sports_facilities", sportFc, {
          type: "circle",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 3, 16, 7] as never,
            "circle-color": "#0f6a5a",
            "circle-stroke-width": 1,
            "circle-stroke-color": "#fff",
            "circle-opacity": 0.9,
          },
          minzoom: 12,
        });

        applyVisibility();
        loadedExtentRef.current = extentToStore;
        loadedDistrictRef.current = selectedDistrict;

        setStatus(
          `Cached buffers ${bufferFc.features.length}, schools ${schoolFc.features.length}, ` +
            `playgrounds ${playFc.features.length}, kitas ${kitaFc.features.length}, sports ${sportFc.features.length}`
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
        <h1 className="brand">Berlin Cannabis Zone Map</h1>
        <p className="lede">
          Click the map to check whether a point sits inside a mapped 100&nbsp;m §&nbsp;5 buffer.
        </p>
        <details className="disclaimer-fold">
          <summary>Legal caveats</summary>
          <p>{DISCLAIMER}</p>
        </details>

        <div className="section">
          <h2>Layers</h2>
          <p className="hint">Buffers on by default. Turn on facilities when you need sources.</p>
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
          <h2>Point check</h2>
          {!check && <p className="empty">Click the map to run a check.</p>}
          {check && <CheckPanel check={check} />}
        </div>

        <div className="section">
          <h2>Borough buffer coverage</h2>
          {coverage && <CoverageTable analysis={coverage} />}
        </div>

        <details className="section provenance-fold">
          <summary>Data provenance</summary>
          {layers.length === 0 && <p className="empty">No catalog rows yet — run the import script.</p>}
          {layers.map((l) => (
            <div className="analysis-card" key={l.slug}>
              <h3>{l.name}</h3>
              <div>Imported: {l.imported_at ?? "—"}</div>
              <div>CRS: EPSG:{l.srid}</div>
              {l.coverage_caveat && <div className="caveat">{l.coverage_caveat}</div>}
            </div>
          ))}
        </details>

        {error && <p className="error">API error: {error}</p>}
      </aside>
      <div className="map-wrap">
        <div className="map" ref={mapNode} />
        <div className="map-chip">{DISCLAIMER_SHORT}</div>
        <div className="legend" aria-label="Map legend">
          <div className="legend-title">Legend</div>
          <div className="legend-row">
            <span className="swatch swatch-fill" style={{ background: "#c45c5c", opacity: 0.45 }} />
            Mapped 100 m buffer
          </div>
          <div className="legend-row">
            <span className="swatch swatch-dot" style={{ background: "#c45c26" }} />
            School
          </div>
          <div className="legend-row">
            <span className="swatch swatch-dot" style={{ background: "#5b4fc7" }} />
            Kita
          </div>
          <div className="legend-row">
            <span className="swatch swatch-dot" style={{ background: "#0f6a5a" }} />
            Sports
          </div>
          <div className="legend-row">
            <span className="swatch swatch-fill" style={{ background: "#b8860b", opacity: 0.7 }} />
            Playground
          </div>
        </div>
        <div className="status">{status}</div>
      </div>
    </div>
  );
}

function CheckPanel({ check }: { check: ConsumptionCheck }) {
  const statusLabel =
    check.status === "likely_restricted"
      ? "Likely restricted (inside mapped buffer)"
      : check.status === "outside_mapped_buffers"
        ? "Outside mapped buffers"
        : "Unknown (no buffers loaded)";

  return (
    <div className={`analysis-card check-${check.status}`}>
      <h3>{statusLabel}</h3>
      <div>
        Point: {check.lon.toFixed(5)}, {check.lat.toFixed(5)} · buffer {check.buffer_m} m
      </div>
      <p className="caveat">{check.caveat}</p>
      {check.hits?.length > 0 && (
        <>
          <strong>Intersecting rules</strong>
          <ul className="hit-list">
            {check.hits.slice(0, 8).map((h, i) => (
              <li key={i}>
                {(h.rule_type as string) ?? "?"} — {(h.name as string) ?? "unnamed"}
              </li>
            ))}
          </ul>
        </>
      )}
      {check.nearest?.length > 0 && (
        <>
          <strong>Nearest buffers</strong>
          <ul className="hit-list">
            {check.nearest.slice(0, 5).map((n, i) => (
              <li key={i}>
                {(n.rule_type as string) ?? "?"} — {(n.name as string) ?? "unnamed"} ·{" "}
                {typeof n.distance_m === "number" ? `${(n.distance_m as number).toFixed(0)} m` : "—"}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function CoverageTable({ analysis }: { analysis: AnalysisResponse }) {
  const rows = analysis.results
    .map((r) => ({
      name: String(r.district_name ?? "—"),
      pct: typeof r.pct_mapped_restricted === "number" ? r.pct_mapped_restricted : null,
    }))
    .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));

  return (
    <div className="analysis-card">
      <p className="caveat">{analysis.caveat}</p>
      <table className="coverage-table">
        <thead>
          <tr>
            <th>Borough</th>
            <th>% mapped</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td>
                <div className="pct-cell">
                  <span className="pct-bar" style={{ width: `${Math.min(r.pct ?? 0, 100)}%` }} />
                  <span className="pct-label">{r.pct == null ? "—" : `${r.pct.toFixed(0)}%`}</span>
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
