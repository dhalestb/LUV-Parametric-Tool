"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ARCH_DESCRIPTORS } from "../evaluations/objDescriptorAnalysis";
import { SITE_TYPOLOGIES, type SiteTypologyId } from "../siteDevelopment/types";
import type { ImportedObj } from "./types";
import {
  auditCoordinateCompatibility,
  copyRuleProfile,
  createObjAssignment,
  createRelation,
  defaultPolygonRuleProfile,
  diagramIdOf,
  emptyAssignmentState,
  loadSiteSessionProject,
  parseProjectFromText,
  readAssignmentState,
  toDiagramRef,
  toPolygonRefs,
  writeAssignmentState,
  type InterPolygonRelation,
  type LatticeSiteAssignmentState,
  type LatticeSourceMode,
  type PolygonObjAssignment,
  type PolygonRuleProfile,
  type SiteDiagramRef,
  type SitePolygonRef,
} from "./latticeSiteBridge";
import type { SiteDevelopmentProject } from "../siteDevelopment/types";

const buttonClass = "rounded border px-2 py-1 text-[10px] disabled:opacity-40";
const buttonStyle = { borderColor: "var(--line)" } as const;
const actionStyle = { ...buttonStyle, background: "var(--accent-primary)", color: "var(--app-background)" } as const;

type MeshOption = Pick<ImportedObj, "id" | "filename">;

type Props = {
  meshes: MeshOption[];
  onStatus?: (message: string) => void;
  onAssignmentChange?: (state: LatticeSiteAssignmentState) => void;
  unitsConfirmed?: boolean;
  onUnitsConfirmedChange?: (confirmed: boolean) => void;
};

function polygonSvgPath(polygon: SitePolygonRef["polygon"], bounds: SitePolygonRef["bounds"], pad = 8, size = 220) {
  const w = Math.max(1e-6, bounds.maxX - bounds.minX);
  const h = Math.max(1e-6, bounds.maxZ - bounds.minZ);
  const scale = (size - pad * 2) / Math.max(w, h);
  const ox = pad + (size - pad * 2 - w * scale) / 2;
  const oy = pad + (size - pad * 2 - h * scale) / 2;
  return polygon
    .map((p, i) => {
      const x = ox + (p[0] - bounds.minX) * scale;
      const y = oy + (p[1] - bounds.minZ) * scale;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ") + " Z";
}

function unionBounds(polygons: SitePolygonRef[]) {
  if (!polygons.length) return { minX: 0, minZ: 0, maxX: 100, maxZ: 100 };
  return polygons.reduce(
    (acc, p) => ({
      minX: Math.min(acc.minX, p.bounds.minX),
      minZ: Math.min(acc.minZ, p.bounds.minZ),
      maxX: Math.max(acc.maxX, p.bounds.maxX),
      maxZ: Math.max(acc.maxZ, p.bounds.maxZ),
    }),
    { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity },
  );
}

export default function LatticeSiteSourcePanel({
  meshes,
  onStatus,
  onAssignmentChange,
  unitsConfirmed = false,
  onUnitsConfirmedChange,
}: Props) {
  const [state, setState] = useState<LatticeSiteAssignmentState>(() => emptyAssignmentState());
  const [project, setProject] = useState<SiteDevelopmentProject | null>(null);
  const [diagram, setDiagram] = useState<SiteDiagramRef | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [focusZoneId, setFocusZoneId] = useState<string | null>(null);
  const [copyFromZoneId, setCopyFromZoneId] = useState<string>("");
  const [auditNote, setAuditNote] = useState<string>("");

  const persist = useCallback((next: LatticeSiteAssignmentState) => {
    setState(next);
    writeAssignmentState(next);
    onAssignmentChange?.(next);
  }, [onAssignmentChange]);

  const applyProject = useCallback((nextProject: SiteDevelopmentProject, sourceLabel: string) => {
    const ref = toDiagramRef(nextProject);
    setProject(nextProject);
    setDiagram(ref);
    const audit = auditCoordinateCompatibility(nextProject);
    setAuditNote(
      audit.ok
        ? `Coordinates OK · ${audit.sitePlanAxes}`
        : `Coordinate warnings: ${audit.issues.join("; ")}`,
    );
    persist({
      ...readAssignmentState(),
      sourceMode: "site-diagram",
      diagramId: ref.diagramId,
      selectedZoneIds: nextProject.zones.filter((z) => z.enabled !== false).map((z) => z.id),
    });
    onStatus?.(`Loaded site diagram “${nextProject.name}” (${sourceLabel}).`);
  }, [onStatus, persist]);

  useEffect(() => {
    const saved = readAssignmentState();
    setState(saved);
    const session = loadSiteSessionProject();
    if (session) {
      setProject(session.project);
      setDiagram(session.ref);
      const audit = auditCoordinateCompatibility(session.project);
      setAuditNote(
        audit.ok
          ? `Session diagram · ${audit.sitePlanAxes}`
          : `Coordinate warnings: ${audit.issues.join("; ")}`,
      );
      if (!saved.diagramId || saved.diagramId === session.ref.diagramId) {
        setState((prev) => ({
          ...prev,
          diagramId: session.ref.diagramId,
          sourceMode: prev.sourceMode === "rectangular-lattice" && saved.diagramId ? prev.sourceMode : (saved.sourceMode !== "rectangular-lattice" ? saved.sourceMode : "site-diagram"),
        }));
      }
    }
    setHydrated(true);
  }, []);

  const polygons = useMemo(() => (project ? toPolygonRefs(project) : []), [project]);
  const developmentPolygons = useMemo(() => polygons.filter((p) => p.kind === "zone"), [polygons]);
  const selectedIds = state.selectedZoneIds;
  const activeZoneId = focusZoneId && selectedIds.includes(focusZoneId)
    ? focusZoneId
    : selectedIds[0] ?? null;
  const activeZone = developmentPolygons.find((p) => p.zoneId === activeZoneId) ?? null;
  const activeRules: PolygonRuleProfile = activeZoneId
    ? (state.rulesByZone[activeZoneId] ?? defaultPolygonRuleProfile(project?.zones.find((z) => z.id === activeZoneId)))
    : defaultPolygonRuleProfile();
  const activeObjs: PolygonObjAssignment[] = activeZoneId ? (state.objByZone[activeZoneId] ?? []) : [];
  const previewBounds = unionBounds(developmentPolygons);

  const setSourceMode = (sourceMode: LatticeSourceMode) => {
    persist({ ...state, sourceMode });
  };

  const toggleZone = (zoneId: string) => {
    const selected = selectedIds.includes(zoneId)
      ? selectedIds.filter((id) => id !== zoneId)
      : [...selectedIds, zoneId];
    persist({ ...state, selectedZoneIds: selected, sourceMode: selected.length ? "site-polygons" : "site-diagram" });
    setFocusZoneId(zoneId);
  };

  const selectAllZones = () => {
    const ids = developmentPolygons.map((p) => p.zoneId);
    persist({ ...state, selectedZoneIds: ids, sourceMode: "site-polygons" });
  };

  const clearZoneSelection = () => {
    persist({ ...state, selectedZoneIds: [], sourceMode: project ? "site-diagram" : "rectangular-lattice" });
    setFocusZoneId(null);
  };

  const updateRules = (patch: Partial<PolygonRuleProfile>) => {
    if (!activeZoneId) return;
    const current = state.rulesByZone[activeZoneId] ?? defaultPolygonRuleProfile(project?.zones.find((z) => z.id === activeZoneId));
    persist({
      ...state,
      rulesByZone: { ...state.rulesByZone, [activeZoneId]: { ...current, ...patch } },
    });
  };

  const updateGeometry = (key: keyof PolygonRuleProfile["geometry"], value: boolean) => {
    updateRules({ geometry: { ...activeRules.geometry, [key]: value } });
  };

  const updateConnection = (key: keyof PolygonRuleProfile["connection"], value: boolean) => {
    updateRules({ connection: { ...activeRules.connection, [key]: value } });
  };

  const setObjList = (list: PolygonObjAssignment[]) => {
    if (!activeZoneId) return;
    persist({ ...state, objByZone: { ...state.objByZone, [activeZoneId]: list } });
  };

  const addObjRow = () => {
    setObjList([...activeObjs, createObjAssignment()]);
  };

  const updateObjRow = (id: string, patch: Partial<PolygonObjAssignment>) => {
    setObjList(activeObjs.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const removeObjRow = (id: string) => {
    setObjList(activeObjs.filter((row) => row.id !== id));
  };

  const copyRulesToActive = () => {
    if (!activeZoneId || !copyFromZoneId || copyFromZoneId === activeZoneId) return;
    const source = state.rulesByZone[copyFromZoneId];
    if (!source) {
      onStatus?.("Source polygon has no saved rule profile yet.");
      return;
    }
    persist({
      ...state,
      rulesByZone: { ...state.rulesByZone, [activeZoneId]: copyRuleProfile(source) },
    });
    onStatus?.(`Copied rule profile from ${copyFromZoneId} → ${activeZoneId} (independent copy).`);
  };

  const addRelation = () => {
    if (selectedIds.length < 2) return;
    const [sourceZoneId, destinationZoneId] = selectedIds;
    persist({ ...state, relations: [...state.relations, createRelation(sourceZoneId, destinationZoneId)] });
  };

  const updateRelation = (id: string, patch: Partial<InterPolygonRelation>) => {
    persist({
      ...state,
      relations: state.relations.map((rel) => (rel.id === id ? { ...rel, ...patch } : rel)),
    });
  };

  const removeRelation = (id: string) => {
    persist({ ...state, relations: state.relations.filter((rel) => rel.id !== id) });
  };

  const importDiagramFile = async (file: File) => {
    const parsed = parseProjectFromText(await file.text());
    if (!parsed.ok) {
      onStatus?.(`Site diagram import failed: ${parsed.error}`);
      return;
    }
    applyProject(parsed.project, file.name);
  };

  const reloadSession = () => {
    const session = loadSiteSessionProject();
    if (!session) {
      onStatus?.("No Site Development session found in localStorage (vul-site-development-v1).");
      return;
    }
    applyProject(session.project, "session");
  };

  if (!hydrated) {
    return <p className="mt-3 text-[10px]" style={{ color: "var(--muted)" }}>Loading site source…</p>;
  }

  return (
    <section className="mt-4 border-t pt-3" style={{ borderColor: "var(--line)" }} data-site-lattice-source>
      <h3 className="text-[11px] font-semibold">Site diagram source</h3>
      <p className="mt-1 text-[10px]" style={{ color: "var(--muted)" }}>
        Select a Site Development diagram and polygons, assign OBJs and rules, then press RUN SITE-FOOTPRINT ARRANGEMENT. Forms pack into the polygon footprint on 20′ bays. Continuous morphing into one habitable envelope is not applied yet.
      </p>

      <label className="mt-2 block text-[10px]" style={{ color: "var(--muted)" }}>
        Lattice source
        <select
          className="mt-1 w-full rounded border bg-transparent px-2 py-1 text-[11px]"
          style={buttonStyle}
          value={state.sourceMode}
          onChange={(e) => setSourceMode(e.target.value as LatticeSourceMode)}
        >
          <option value="rectangular-lattice">Standard rectangular lattice</option>
          <option value="site-diagram">Saved Site Development diagram</option>
          <option value="site-polygons">Selected Site Development polygon(s)</option>
        </select>
      </label>

      {state.sourceMode !== "rectangular-lattice" && (
        <>
          <div className="mt-2 flex flex-wrap gap-1">
            <button type="button" className={buttonClass} style={buttonStyle} onClick={reloadSession}>Load session diagram</button>
            <label className={buttonClass} style={{ ...buttonStyle, cursor: "pointer", display: "inline-block" }}>
              Import site JSON
              <input
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void importDiagramFile(file);
                  e.target.value = "";
                }}
              />
            </label>
          </div>

          {diagram && project ? (
            <div className="mt-2 rounded border p-2 text-[10px]" style={{ borderColor: "var(--line)" }}>
              <div><strong>{diagram.name}</strong></div>
              <div style={{ color: "var(--muted)" }}>
                Ref: {diagram.diagramId.slice(0, 64)}{diagram.diagramId.length > 64 ? "…" : ""}
              </div>
              <div style={{ color: "var(--muted)" }}>
                v{diagram.version} · {diagram.zoneCount} zones · {diagram.exclusionCount} exclusions · saved {diagram.savedAt || "unsaved"}
              </div>
              <div style={{ color: "var(--muted)" }}>{auditNote}</div>
              <div style={{ color: "var(--muted)" }}>
                Origin [{diagram.coordinates.origin.join(", ")}] · elevation datum {diagram.coordinates.elevationDatum} · unit {diagram.coordinates.unit} ({diagram.coordinates.unitAssumption}) · feetPerModel {diagram.coordinates.feetPerModel}
              </div>
              {project.coordinates.unitAssumption === "confirmed" ? (
                <p className="mt-2" style={{ color: "var(--accent)" }}>
                  Site units confirmed in Site Development ({project.coordinates.unit}, feetPerModel={project.coordinates.feetPerModel}).
                </p>
              ) : (
                <label className="mt-2 flex items-start gap-2" style={{ color: unitsConfirmed ? "var(--accent)" : "var(--text)" }}>
                  <input
                    type="checkbox"
                    checked={unitsConfirmed}
                    onChange={(event) => onUnitsConfirmedChange?.(event.target.checked)}
                  />
                  <span>
                    I confirm the imported site is in <strong>{project.coordinates.unit}</strong>
                    {" "}(feetPerModel={project.coordinates.feetPerModel}). Validated site-constrained generation stays blocked until this is checked or confirmed in Site Development.
                  </span>
                </label>
              )}
            </div>
          ) : (
            <p className="mt-2 text-[10px]" style={{ color: "var(--muted)" }}>
              No diagram loaded. Open Site Development, save a diagram, or import its JSON here.
            </p>
          )}

          {developmentPolygons.length > 0 && (
            <>
              <div className="mt-2 flex flex-wrap gap-1">
                <button type="button" className={buttonClass} style={buttonStyle} onClick={selectAllZones}>Select all polygons</button>
                <button type="button" className={buttonClass} style={buttonStyle} onClick={clearZoneSelection}>Clear selection</button>
              </div>

              <svg viewBox="0 0 220 220" className="mt-2 w-full rounded border" style={{ borderColor: "var(--line)", background: "var(--app-background)" }} aria-label="Site polygon preview">
                {developmentPolygons.map((poly) => {
                  const selected = selectedIds.includes(poly.zoneId);
                  const focused = poly.zoneId === activeZoneId;
                  return (
                    <path
                      key={poly.zoneId}
                      d={polygonSvgPath(poly.polygon, previewBounds)}
                      fill={selected ? poly.color : "transparent"}
                      fillOpacity={selected ? (focused ? 0.45 : 0.22) : 0}
                      stroke={focused ? "var(--accent-primary)" : poly.color}
                      strokeWidth={focused ? 2.5 : 1.25}
                      style={{ cursor: "pointer" }}
                      onClick={() => toggleZone(poly.zoneId)}
                    >
                      <title>{poly.name}</title>
                    </path>
                  );
                })}
              </svg>

              <ul className="mt-2 space-y-1">
                {developmentPolygons.map((poly) => {
                  const selected = selectedIds.includes(poly.zoneId);
                  return (
                    <li key={poly.zoneId}>
                      <label className="flex items-start gap-2 text-[10px]">
                        <input type="checkbox" checked={selected} onChange={() => toggleZone(poly.zoneId)} />
                        <button
                          type="button"
                          className="text-left"
                          style={{ color: poly.zoneId === activeZoneId ? "var(--accent-primary)" : "inherit" }}
                          onClick={() => setFocusZoneId(poly.zoneId)}
                        >
                          <span style={{ color: poly.color }}>■</span> {poly.name}
                          <span style={{ color: "var(--muted)" }}> · {poly.areaFeet2.toFixed(0)} ft² · id {poly.zoneId}</span>
                        </button>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {activeZone && (
            <div className="mt-3 rounded border p-2" style={{ borderColor: "var(--line)" }} data-active-polygon={activeZone.zoneId}>
              <div className="text-[11px] font-semibold">Polygon: {activeZone.name}</div>
              <p className="text-[10px]" style={{ color: "var(--muted)" }}>
                Centroid ({activeZone.centroid[0].toFixed(1)}, {activeZone.centroid[1].toFixed(1)}) · bounds {activeZone.bounds.minX.toFixed(1)}–{activeZone.bounds.maxX.toFixed(1)} × {activeZone.bounds.minZ.toFixed(1)}–{activeZone.bounds.maxZ.toFixed(1)} ft
              </p>

              <div className="mt-2 text-[10px] font-semibold">OBJ assignments</div>
              {activeObjs.map((row) => (
                <div key={row.id} className="mt-1 grid gap-1 rounded border p-1" style={{ borderColor: "var(--line)" }}>
                  <label>
                    Mesh
                    <select
                      className="mt-0.5 w-full rounded border bg-transparent px-1 py-0.5"
                      style={buttonStyle}
                      value={row.meshId ?? ""}
                      onChange={(e) => {
                        const mesh = meshes.find((m) => m.id === e.target.value);
                        updateObjRow(row.id, { meshId: mesh?.id ?? null, filename: mesh?.filename ?? null });
                      }}
                    >
                      <option value="">— select uploaded OBJ —</option>
                      {meshes.map((m) => (
                        <option key={m.id} value={m.id}>{m.filename || m.id}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Typology
                    <select
                      className="mt-0.5 w-full rounded border bg-transparent px-1 py-0.5"
                      style={buttonStyle}
                      value={row.typologyId ?? ""}
                      onChange={(e) => updateObjRow(row.id, { typologyId: (e.target.value || null) as SiteTypologyId | null })}
                    >
                      <option value="">— none —</option>
                      {SITE_TYPOLOGIES.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-1">
                    <label>Instances
                      <input type="number" min={1} max={64} className="mt-0.5 w-full rounded border bg-transparent px-1 py-0.5" style={buttonStyle}
                        value={row.instanceCount}
                        onChange={(e) => updateObjRow(row.id, { instanceCount: Math.max(1, Number(e.target.value) || 1) })}
                      />
                    </label>
                    <label>Yaw °
                      <input type="number" className="mt-0.5 w-full rounded border bg-transparent px-1 py-0.5" style={buttonStyle}
                        value={row.preferredYawDeg}
                        onChange={(e) => updateObjRow(row.id, { preferredYawDeg: Number(e.target.value) || 0 })}
                      />
                    </label>
                    <label>Elevation ft
                      <input type="number" className="mt-0.5 w-full rounded border bg-transparent px-1 py-0.5" style={buttonStyle}
                        value={row.elevationOffsetFeet}
                        onChange={(e) => updateObjRow(row.id, { elevationOffsetFeet: Number(e.target.value) || 0 })}
                      />
                    </label>
                    <label className="flex items-end gap-1 pb-1">
                      <input type="checkbox" checked={row.allowMirror} onChange={(e) => updateObjRow(row.id, { allowMirror: e.target.checked })} />
                      Allow mirror
                    </label>
                  </div>
                  <button type="button" className={buttonClass} style={buttonStyle} onClick={() => removeObjRow(row.id)}>Remove OBJ row</button>
                </div>
              ))}
              <button type="button" className={`${buttonClass} mt-1`} style={actionStyle} onClick={addObjRow}>Add OBJ type</button>

              <div className="mt-3 text-[10px] font-semibold">Rule profile (this polygon only)</div>
              <div className="mt-1 grid grid-cols-2 gap-1 text-[10px]">
                <label>Quantity mode
                  <select className="mt-0.5 w-full rounded border bg-transparent px-1 py-0.5" style={buttonStyle}
                    value={activeRules.quantityMode}
                    onChange={(e) => updateRules({ quantityMode: e.target.value as PolygonRuleProfile["quantityMode"] })}
                  >
                    <option value="manual">Manual</option>
                    <option value="automatic">Automatic</option>
                  </select>
                </label>
                <label>Target count
                  <input type="number" min={0} className="mt-0.5 w-full rounded border bg-transparent px-1 py-0.5" style={buttonStyle}
                    value={activeRules.targetCount}
                    onChange={(e) => updateRules({ targetCount: Number(e.target.value) || 0 })}
                  />
                </label>
                <label>Coverage %
                  <input type="number" min={0} max={100} className="mt-0.5 w-full rounded border bg-transparent px-1 py-0.5" style={buttonStyle}
                    value={activeRules.targetCoveragePercent}
                    onChange={(e) => updateRules({ targetCoveragePercent: Number(e.target.value) || 0 })}
                  />
                </label>
                <label>Min separation ft
                  <input type="number" min={0} className="mt-0.5 w-full rounded border bg-transparent px-1 py-0.5" style={buttonStyle}
                    value={activeRules.clusterSeparationFeet}
                    onChange={(e) => updateRules({ clusterSeparationFeet: Number(e.target.value) || 0 })}
                  />
                </label>
                <label>Edge clearance ft
                  <input type="number" min={0} className="mt-0.5 w-full rounded border bg-transparent px-1 py-0.5" style={buttonStyle}
                    value={activeRules.minEdgeClearanceFeet}
                    onChange={(e) => updateRules({ minEdgeClearanceFeet: Number(e.target.value) || 0 })}
                  />
                </label>
                <label>Distribution
                  <select className="mt-0.5 w-full rounded border bg-transparent px-1 py-0.5" style={buttonStyle}
                    value={activeRules.distributionMode}
                    onChange={(e) => updateRules({ distributionMode: e.target.value as PolygonRuleProfile["distributionMode"] })}
                  >
                    <option value="balanced">Balanced</option>
                    <option value="waterfront">Waterfront</option>
                    <option value="roadway-buffer">Roadway buffer</option>
                    <option value="custom-anchors">Custom anchors</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                </label>
                <label>Orientation
                  <select className="mt-0.5 w-full rounded border bg-transparent px-1 py-0.5" style={buttonStyle}
                    value={activeRules.orientationMode}
                    onChange={(e) => updateRules({ orientationMode: e.target.value as PolygonRuleProfile["orientationMode"] })}
                  >
                    <option value="fixed">Fixed</option>
                    <option value="automatic">Automatic</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                </label>
                <label>Preferred yaw °
                  <input type="number" className="mt-0.5 w-full rounded border bg-transparent px-1 py-0.5" style={buttonStyle}
                    value={activeRules.preferredYawDeg}
                    onChange={(e) => updateRules({ preferredYawDeg: Number(e.target.value) || 0 })}
                  />
                </label>
                <label>Elevation offset ft
                  <input type="number" className="mt-0.5 w-full rounded border bg-transparent px-1 py-0.5" style={buttonStyle}
                    value={activeRules.elevationOffsetFeet}
                    onChange={(e) => updateRules({ elevationOffsetFeet: Number(e.target.value) || 0 })}
                  />
                </label>
                <label>Max height ft
                  <input type="number" min={0} className="mt-0.5 w-full rounded border bg-transparent px-1 py-0.5" style={buttonStyle}
                    value={activeRules.maxHeightFeet}
                    onChange={(e) => updateRules({ maxHeightFeet: Number(e.target.value) || 0 })}
                  />
                </label>
                <label>Boundary behavior
                  <select className="mt-0.5 w-full rounded border bg-transparent px-1 py-0.5" style={buttonStyle}
                    value={activeRules.boundaryBehavior}
                    onChange={(e) => updateRules({ boundaryBehavior: e.target.value as PolygonRuleProfile["boundaryBehavior"] })}
                  >
                    <option value="full-geometry-inside">Full geometry inside</option>
                    <option value="roots-inside">Roots inside</option>
                    <option value="controlled-projection">Controlled projection</option>
                  </select>
                </label>
              </div>
              <label className="mt-1 flex items-center gap-1 text-[10px]">
                <input type="checkbox" checked={activeRules.lockPreferredYaw} onChange={(e) => updateRules({ lockPreferredYaw: e.target.checked })} />
                Lock preferred yaw
              </label>
              <label className="flex items-center gap-1 text-[10px]">
                <input type="checkbox" checked={activeRules.orientationFine45} onChange={(e) => updateRules({ orientationFine45: e.target.checked })} />
                45° orientation search
              </label>

              <div className="mt-2 text-[10px] font-semibold">A. Placement / orientation</div>
              <p className="text-[10px]" style={{ color: "var(--muted)" }}>Uses the fields above (reuse of Site Development orientation + spacing policy).</p>

              <div className="mt-2 text-[10px] font-semibold">B. Geometric generation</div>
              <div className="grid grid-cols-1 gap-0.5 text-[10px]">
                {(
                  [
                    ["branchExtension", "Branch extension"],
                    ["branchRetraction", "Branch retraction"],
                    ["floorCornerProjections", "Floor-corner projections"],
                    ["floorEdgeExtensions", "Floor-edge extensions"],
                    ["sharedFloors", "Shared floor development"],
                    ["geometricInterlock", "Geometric interlocking"],
                    ["organicSurfaceMorphing", "Organic surface morphing"],
                    ["sharedEnclosure", "Shared building enclosure"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-1">
                    <input type="checkbox" checked={activeRules.geometry[key]} onChange={(e) => updateGeometry(key, e.target.checked)} />
                    {label}
                  </label>
                ))}
              </div>

              <div className="mt-2 text-[10px] font-semibold">C. Connection strategy</div>
              <div className="grid grid-cols-1 gap-0.5 text-[10px]">
                {(
                  [
                    ["branchFirstOrganic", "Branch-first organic"],
                    ["bridges", "Bridges"],
                    ["ramps", "Ramps"],
                    ["stairsLandings", "Stairs and landings"],
                    ["localWallOpenings", "Local wall openings"],
                    ["sharedFloors", "Shared floors"],
                    ["geometricBlending", "Geometric blending / morphing"],
                    ["sharedEnvelope", "Shared envelope / roof"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-1">
                    <input type="checkbox" checked={activeRules.connection[key]} onChange={(e) => updateConnection(key, e.target.checked)} />
                    {label}
                  </label>
                ))}
              </div>

              <div className="mt-2 text-[10px] font-semibold">D. Descriptor influence</div>
              <p className="text-[10px]" style={{ color: "var(--muted)" }}>Priorities only — evaluation formulas stay unchanged.</p>
              <div className="mt-1 max-h-28 overflow-auto text-[10px]">
                {ARCH_DESCRIPTORS.map((d) => {
                  const on = activeRules.descriptorPriorities.includes(d.id);
                  return (
                    <label key={d.id} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...activeRules.descriptorPriorities, d.id]
                            : activeRules.descriptorPriorities.filter((id) => id !== d.id);
                          updateRules({ descriptorPriorities: next });
                        }}
                      />
                      {d.name}
                    </label>
                  );
                })}
              </div>

              <div className="mt-2 flex flex-wrap items-end gap-1 text-[10px]">
                <label className="flex-1">
                  Copy rules from
                  <select
                    className="mt-0.5 w-full rounded border bg-transparent px-1 py-0.5"
                    style={buttonStyle}
                    value={copyFromZoneId}
                    onChange={(e) => setCopyFromZoneId(e.target.value)}
                  >
                    <option value="">—</option>
                    {developmentPolygons.filter((p) => p.zoneId !== activeZoneId).map((p) => (
                      <option key={p.zoneId} value={p.zoneId}>{p.name}</option>
                    ))}
                  </select>
                </label>
                <button type="button" className={buttonClass} style={buttonStyle} onClick={copyRulesToActive}>Copy profile</button>
              </div>
            </div>
          )}

          {selectedIds.length >= 2 && (
            <div className="mt-3 rounded border p-2" style={{ borderColor: "var(--line)" }}>
              <div className="text-[11px] font-semibold">Inter-polygon relations</div>
              <p className="text-[10px]" style={{ color: "var(--muted)" }}>
                Corridors between polygons are separate from development polygons. Not every pair must connect.
              </p>
              <button type="button" className={`${buttonClass} mt-1`} style={actionStyle} onClick={addRelation}>Add relation (first → second selected)</button>
              {state.relations.map((rel) => (
                <div key={rel.id} className="mt-2 grid gap-1 rounded border p-1 text-[10px]" style={{ borderColor: "var(--line)" }}>
                  <label>Source
                    <select className="mt-0.5 w-full rounded border bg-transparent px-1 py-0.5" style={buttonStyle}
                      value={rel.sourceZoneId}
                      onChange={(e) => updateRelation(rel.id, { sourceZoneId: e.target.value })}
                    >
                      {developmentPolygons.map((p) => <option key={p.zoneId} value={p.zoneId}>{p.name}</option>)}
                    </select>
                  </label>
                  <label>Destination
                    <select className="mt-0.5 w-full rounded border bg-transparent px-1 py-0.5" style={buttonStyle}
                      value={rel.destinationZoneId}
                      onChange={(e) => updateRelation(rel.id, { destinationZoneId: e.target.value })}
                    >
                      {developmentPolygons.map((p) => <option key={p.zoneId} value={p.zoneId}>{p.name}</option>)}
                    </select>
                  </label>
                  <label>Strategy
                    <select className="mt-0.5 w-full rounded border bg-transparent px-1 py-0.5" style={buttonStyle}
                      value={rel.strategy}
                      onChange={(e) => updateRelation(rel.id, { strategy: e.target.value as InterPolygonRelation["strategy"] })}
                    >
                      <option value="organic-bridge">Organic bridge</option>
                      <option value="branch-first">Branch-first</option>
                      <option value="shared-floor">Shared floor</option>
                      <option value="stepped">Stepped</option>
                      <option value="visual-only">Visual only</option>
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-1">
                    <label>Quantity
                      <input type="number" min={0} className="mt-0.5 w-full rounded border bg-transparent px-1 py-0.5" style={buttonStyle}
                        value={rel.quantity}
                        onChange={(e) => updateRelation(rel.id, { quantity: Number(e.target.value) || 0 })}
                      />
                    </label>
                    <label>Max reach ft
                      <input type="number" min={0} className="mt-0.5 w-full rounded border bg-transparent px-1 py-0.5" style={buttonStyle}
                        value={rel.maxReachFeet}
                        onChange={(e) => updateRelation(rel.id, { maxReachFeet: Number(e.target.value) || 0 })}
                      />
                    </label>
                    <label>Max Δ elev ft
                      <input type="number" min={0} className="mt-0.5 w-full rounded border bg-transparent px-1 py-0.5" style={buttonStyle}
                        value={rel.maxElevationDeltaFeet}
                        onChange={(e) => updateRelation(rel.id, { maxElevationDeltaFeet: Number(e.target.value) || 0 })}
                      />
                    </label>
                    <label>Morph strength
                      <input type="number" min={0} max={1} step={0.05} className="mt-0.5 w-full rounded border bg-transparent px-1 py-0.5" style={buttonStyle}
                        value={rel.morphingStrength}
                        onChange={(e) => updateRelation(rel.id, { morphingStrength: Number(e.target.value) || 0 })}
                      />
                    </label>
                  </div>
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={rel.preserveSourceIdentity} onChange={(e) => updateRelation(rel.id, { preserveSourceIdentity: e.target.checked })} />
                    Preserve source-form identity
                  </label>
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={rel.requireCirculationValidation} onChange={(e) => updateRelation(rel.id, { requireCirculationValidation: e.target.checked })} />
                    Require circulation validation
                  </label>
                  <button type="button" className={buttonClass} style={buttonStyle} onClick={() => removeRelation(rel.id)}>Remove relation</button>
                </div>
              ))}
            </div>
          )}

          <p className="mt-2 text-[10px]" style={{ color: "var(--muted)" }}>
            Assignments persist under <code>vul-lattice-site-assignments-v1</code> and reference diagram id {project ? diagramIdOf(project) : "(none)"}. Polygons are not duplicated — coordinates stay on the Site Development document.
          </p>
        </>
      )}
    </section>
  );
}
