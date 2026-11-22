"use client";
import CentralizedVerification from './CentralizedVerification';
import ArchitecturalRegionExperiment from './ArchitecturalRegionExperiment';

import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import AppNav from "../AppNav";
import { analyzeMesh } from "../lattice/analyze";
import { useLatticeSource } from "../lattice/latticeSource";
import { buildCompleteFileGeometry, combinedBoundsSpec, IDENTITY_PLACEMENT, tileRootMatrix, triangleCount } from "../lattice/objFidelity";
import { LATTICE_SLOTS, slotById } from "../lattice/slots";
import type { ImportedObj, TileModel, UpAxisMode, UnitName } from "../lattice/types";
import { resolvedUp, UNIT_TO_FEET } from "../lattice/types";
import {
  assignRelativeRanks,
  evaluateTileModel,
  publishDescriptorRanks,
  type ArchDescriptorId,
  type FormDescriptorEvaluation,
} from "./objDescriptorAnalysis";
import DescriptorComparison from "./DescriptorComparison";
import { VISIBLE_DESCRIPTOR_IDS, VISIBLE_DESCRIPTORS } from './visibleDescriptors';

const buttonStyle = { borderColor: "var(--line)", background: "var(--panel-soft)", color: "var(--ink)" } as const;

function PreviewMesh({ mesh, unit, upAxisMode }: { mesh: ImportedObj; unit: UnitName; upAxisMode: UpAxisMode }) {
  const group = useRef<import("three").Group>(null);
  const geometry = useMemo(() => buildCompleteFileGeometry(mesh), [mesh]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => {
    if (!group.current) return;
    const matrix = tileRootMatrix(mesh, IDENTITY_PLACEMENT(mesh.id), UNIT_TO_FEET[unit], upAxisMode, {
      register: true,
      applyUnitAndUp: true,
    });
    group.current.matrix.copy(matrix);
    group.current.matrixAutoUpdate = false;
    group.current.updateMatrixWorld(true);
  }, [mesh, unit, upAxisMode]);

  return (
    <group ref={group}>
      <mesh geometry={geometry}>
        <meshBasicMaterial color="#e8e4dc" />
      </mesh>
    </group>
  );
}

function FormPreview({ mesh, unit, upAxisMode }: { mesh: ImportedObj | null; unit: UnitName; upAxisMode: UpAxisMode }) {
  if (!mesh) {
    return (
      <div className="flex h-full min-h-[240px] items-center justify-center text-[12px]" style={{ color: "var(--muted)" }}>
        This slot has no Lattice source OBJ. Assign one in Lattice, or use Load Sample OBJs for empty slots only.
      </div>
    );
  }
  return (
    <Canvas
      data-board-geometry
      frameloop="demand"
      dpr={[1, 1.25]}
      camera={{ position: [48, 36, 48], fov: 40, near: 0.1, far: 4000 }}
      gl={{ alpha: false, antialias: true, powerPreference: "high-performance" }}
      flat
      style={{ width: "100%", height: "100%", minHeight: 240, background: "#0a0a0a" }}
    >
      <ambientLight intensity={1} />
      <PreviewMesh mesh={mesh} unit={unit} upAxisMode={upAxisMode} />
      <OrbitControls makeDefault target={[0, 8, 0]} enableDamping={false} />
    </Canvas>
  );
}

function near(a: number, b: number) {
  return Math.abs(a - b) <= 1e-3 * Math.max(1, Math.abs(a), Math.abs(b));
}

function sourceStats(mesh: ImportedObj, unit: UnitName, upAxisMode: UpAxisMode) {
  const up = resolvedUp(mesh.upAxis, upAxisMode);
  const bounds = combinedBoundsSpec(mesh, UNIT_TO_FEET[unit], up);
  return {
    vertices: mesh.positions.length / 3,
    triangles: triangleCount(mesh),
    faces: mesh.faces.length,
    bounds,
  };
}

/** Counts taken from the BufferGeometry the preview actually draws. */
function previewStats(mesh: ImportedObj, unit: UnitName, upAxisMode: UpAxisMode) {
  const geometry = buildCompleteFileGeometry(mesh);
  const position = geometry.getAttribute("position");
  const vertices = position.count;
  const triangles = geometry.getIndex() ? geometry.getIndex()!.count / 3 : 0;
  const matrix = tileRootMatrix(mesh, IDENTITY_PLACEMENT(mesh.id), UNIT_TO_FEET[unit], upAxisMode, {
    register: true,
    applyUnitAndUp: true,
  });
  geometry.applyMatrix4(matrix);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox ?? new THREE.Box3();
  const size: [number, number, number] = [
    box.max.x - box.min.x,
    box.max.y - box.min.y,
    box.max.z - box.min.z,
  ];
  geometry.dispose();
  return { vertices, triangles, size };
}

export default function ArchitecturalEvaluations() {
  const sourceRegistry = useLatticeSource();
  const { hydrated, origin, meshes, assignments, unit, upAxisMode, loadSampleObjs, importObjFiles, setMeshes, setAssignments } = sourceRegistry;
  const geometryPersisted = 'geometryPersisted' in sourceRegistry ? Boolean(sourceRegistry.geometryPersisted) : true;
  const uploadRef = useRef<HTMLInputElement>(null);
  const importRef = useRef(importObjFiles);
  importRef.current = importObjFiles;
  const [models, setModels] = useState<Record<string, TileModel>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Waiting for the Lattice source registry…");
  const [selectedSlotId, setSelectedSlotId] = useState(LATTICE_SLOTS[0]?.id ?? "G1");
  const [explainId, setExplainId] = useState<ArchDescriptorId>("openVolume");
  const [includeTopDecks, setIncludeTopDecks] = useState(true);
  const [results, setResults] = useState<Record<string, FormDescriptorEvaluation>>({});

  const rows = useMemo(() => LATTICE_SLOTS.map((slot) => {
    const mesh = meshes.find((item) => item.id === assignments[slot.id]) ?? null;
    const result = mesh ? results[mesh.id] : undefined;
    return { slot, mesh, result };
  }), [meshes, assignments, results]);

  const analyzedCount = useMemo(() => rows.filter((row) => row.result?.status === "ready").length, [rows]);
  const selected = rows.find((row) => row.slot.id === selectedSlotId) ?? rows[0];
  const explain = selected?.result?.descriptors.find((item) => item.id === explainId) ?? selected?.result?.descriptors.find((item) => VISIBLE_DESCRIPTOR_IDS.includes(item.id));
  const selectedSessionRank = explain?.comparativeRank !== undefined && explain.cohortSize
    ? { rank: explain.comparativeRank, cohortSize: explain.cohortSize }
    : null;
  const stats = useMemo(
    () => (selected?.mesh ? sourceStats(selected.mesh, unit, upAxisMode) : null),
    [selected?.mesh, unit, upAxisMode],
  );
  const drawn = useMemo(
    () => (selected?.mesh ? previewStats(selected.mesh, unit, upAxisMode) : null),
    [selected?.mesh, unit, upAxisMode],
  );
  const assignedCount = rows.filter((row) => row.mesh).length;
  const fidelityRows = useMemo(() => rows.map((row) => {
    if (!row.mesh) return { slot: row.slot, mesh: null as ImportedObj | null, match: false };
    const source = sourceStats(row.mesh, unit, upAxisMode);
    const preview = previewStats(row.mesh, unit, upAxisMode);
    const [sx, sy, sz] = source.bounds.size;
    const [dx, dy, dz] = preview.size;
    const match = source.vertices === preview.vertices
      && source.triangles === preview.triangles
      && near(sx, dx) && near(sy, dz) && near(sz, dy);
    return { slot: row.slot, mesh: row.mesh, source, preview, match };
  }), [rows, unit, upAxisMode]);

  useEffect(() => {
    if (!hydrated) return;
    if (!assignedCount) {
      setStatus("No Lattice source OBJs are assigned. Assign forms in Lattice, or press Load Sample OBJs to fill empty slots from /part2-samples/.");
      return;
    }
    setStatus(`Using ${assignedCount} / ${LATTICE_SLOTS.length} forms from the Lattice source registry (${origin}).`);
  }, [hydrated, assignedCount, origin]);

  async function analyzeAll() {
    const targets = rows.filter((row) => row.mesh);
    if (!targets.length) {
      setStatus("Nothing to analyze. Assign Lattice sources first.");
      return;
    }
    setBusy(true);
    setStatus("Analyzing assigned Lattice source OBJs…");
    try {
      const nextModels: Record<string, TileModel> = {};
      const nextResults: Record<string, FormDescriptorEvaluation> = {};
      for (const row of targets) {
        const mesh = row.mesh!;
        const up = resolvedUp(mesh.upAxis, upAxisMode);
        const model = analyzeMesh(mesh, row.slot.id, UNIT_TO_FEET[unit], up);
        const evaluated = evaluateTileModel(model, {
          positions: mesh.positions,
          faces: mesh.faces,
          up,
          unitScale: UNIT_TO_FEET[unit],
        }, { includeTopDecks, retainedDescriptors: results[mesh.id]?.descriptors });
        const {savedCentralizedResult}=await import('./v4/verifiedCentralizedResult');
        const verified=await savedCentralizedResult(mesh,up,unit);
        const legacy=evaluated.descriptors.find(d=>d.id==='centralized');
        const historicalKey='luv-centralized-graph-history:'+mesh.id+':'+legacy?.evidence?.sourceHash+':'+up+':'+unit+':'+includeTopDecks;
        if(legacy&&!localStorage.getItem(historicalKey))localStorage.setItem(historicalKey,JSON.stringify({score:legacy.absoluteScore,version:legacy.version,reason:legacy.unavailableReason}));
        nextModels[mesh.id] = model;
        nextResults[mesh.id] = {
          meshId: mesh.id,
          slotId: row.slot.id,
          filename: mesh.filename,
          category: row.slot.category,
          code: row.slot.code,
          name: row.slot.name,
          status: "ready",
          confidence: evaluated.confidence,
          raw: evaluated.raw,
          descriptors: evaluated.descriptors.map(d=>d.id==='centralized'?verified:d),
        };
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      const ranked = Object.values(nextResults);
      assignRelativeRanks(ranked);
      publishDescriptorRanks(ranked);
      for (const result of ranked) result.descriptors = result.descriptors.filter(descriptor => VISIBLE_DESCRIPTOR_IDS.includes(descriptor.id));
      setModels(nextModels);
      setResults(nextResults);
      setStatus(`Analyzed ${targets.length} Lattice source OBJ${targets.length === 1 ? "" : "s"} · 5 descriptors each${includeTopDecks ? " · top decks included" : " · official v4.1 (top decks excluded)"}. Unassigned slots were skipped.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Analysis failed.");
    } finally {
      setBusy(false);
    }
  }

  async function importOriginals(files: File[]) {
    setBusy(true);
    setStatus("Reading OBJ files into the Lattice source registry…");
    const result = await importObjFiles(files);
    setResults({});
    setModels({});
    setBusy(false);
    const imported = result.imported ? `Imported ${result.imported} OBJ file${result.imported === 1 ? "" : "s"}.` : "No OBJ files were imported.";
    const follow = "Press Analyze All Forms. Keep the unit at feet so the recorded Open Volume scores stay comparable.";
    setStatus([imported, 'note' in result ? result.note : undefined, result.error, follow].filter(Boolean).join(" "));
  }

  function clearLoadedForms() {
    setMeshes([]);
    setAssignments({});
    setResults({});
    setModels({});
    setStatus("Loaded forms cleared. Upload the original OBJ files, then press Analyze All Forms.");
  }

  async function loadOriginalPair() {
    setBusy(true);
    setStatus("Loading Gathering Linear.obj and Lobby Continuous Hall.obj from the local original set…");
    try {
      const names = ["Gathering Linear.obj", "Lobby, Cont Hall.obj"];
      const files: File[] = [];
      for (const name of names) {
        const response = await fetch(`/api/review-pair?file=${encodeURIComponent(name)}`);
        if (!response.ok) throw new Error("The original OBJ directory is not available. Use Upload OBJ files.");
        files.push(new File([await response.text()], name, { type: "text/plain" }));
      }
      setMeshes([]);
      setAssignments({});
      setResults({});
      setModels({});
      await new Promise((resolve) => window.setTimeout(resolve, 50));
      const result = await importRef.current(files);
      setStatus(result.error ?? `Loaded ${result.imported} original OBJ file${result.imported === 1 ? "" : "s"}. Press Analyze All Forms. Unit should stay feet.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The original pair could not be loaded.");
    } finally {
      setBusy(false);
    }
  }

  async function loadSamples() {
    setBusy(true);
    setStatus("Loading sample OBJs into empty Lattice slots…");
    const result = await loadSampleObjs();
    setBusy(false);
    setResults({});
    setModels({});
    setStatus(result.error ? result.error : `Loaded ${result.loaded} sample OBJ${result.loaded === 1 ? "" : "s"} into unassigned slots.`);
  }

  return (
    <div data-board-page="evaluations" className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-3 px-4 py-4 md:px-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-baseline gap-2.5">
            <h1 className="text-lg font-semibold tracking-tight" style={{ fontFamily: "var(--font-sans)" }}>
              Evaluations
            </h1>
            <span className="text-[11px] tracking-[0.14em] uppercase" style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
              Architectural OBJ descriptors
            </span>
          </div>
          <AppNav />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy || !hydrated}
            onClick={() => void analyzeAll()}
            className="rounded px-2.5 py-1 text-[11px] font-medium text-black hover:opacity-90"
            style={{ background: "var(--accent-primary)" }}
          >
            {busy ? "Working…" : "Analyze All Forms"}
          </button>
          <button type="button" disabled={busy || !hydrated} className="rounded border px-2.5 py-1 text-[11px]" style={buttonStyle} onClick={() => void loadOriginalPair()}>
            Load original pair
          </button>
          <button type="button" disabled={busy || !hydrated} className="rounded border px-2.5 py-1 text-[11px]" style={buttonStyle} onClick={() => uploadRef.current?.click()}>
            Upload OBJ files
          </button>
          <input ref={uploadRef} type="file" accept=".obj" multiple hidden onChange={(event) => { if (event.target.files) void importOriginals([...event.target.files]); event.target.value = ""; }} />
          <button type="button" disabled={busy || !hydrated} className="rounded border px-2.5 py-1 text-[11px]" style={buttonStyle} onClick={clearLoadedForms}>
            Clear loaded forms
          </button>
          <button type="button" disabled={busy || !hydrated} className="rounded border px-2.5 py-1 text-[11px]" style={buttonStyle} onClick={() => void loadSamples()}>
            Load Sample OBJs
          </button>
          <label className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--ink)" }}>
            <input
              type="checkbox"
              checked={includeTopDecks}
              disabled={busy}
              onChange={(event) => {
                setIncludeTopDecks(event.target.checked);
                setResults({});
                setModels({});
              }}
            />
            Include top decks
          </label>
        </div>
      </header>

      <p className="text-[12px]" style={{ color: "var(--muted)" }}>{status}</p>
      <CentralizedVerification meshes={meshes} unit={unit} upAxisMode={upAxisMode} onApply={(id,descriptor)=>{
        if(!results[id])return false;
        const ranked=Object.values(results).map(form=>({...form,descriptors:form.descriptors.map(d=>d.id==='centralized'&&form.meshId===id?{...descriptor}:{...d})}));
        assignRelativeRanks(ranked);
        publishDescriptorRanks(ranked);
        setResults(Object.fromEntries(ranked.map(form=>[form.meshId,form])));
        return true;
      }}/>
      <ArchitecturalRegionExperiment meshes={meshes} unit={unit} upAxisMode={upAxisMode}/>
      <p className="text-[12px]" style={{ color: "var(--muted)" }}>
        Unit {unit}. Up axis {upAxisMode}. {includeTopDecks ? "Uncovered top decks on a counted level are scored as open-to-sky floor. Roof lids stay excluded. Press Analyze All Forms after changing this." : "Official v4.1: uncovered top decks are excluded from interior Open Volume, visibility, and light. Press Analyze All Forms after changing this."}
      </p>
      {!geometryPersisted && (
        <p className="text-[12px]" style={{ color: "var(--muted)" }}>
          The uploaded meshes are in this browser tab only. They are too large for browser storage, so a refresh clears them. Evaluations does not substitute the bundled sample tiles.
        </p>
      )}

      <div className="evaluations-layout grid min-h-0 flex-1 gap-3 lg:grid-cols-[280px_minmax(0,1fr)_320px]">
        <aside className="min-h-0 overflow-auto rounded border p-2" style={{ borderColor: "var(--line)", background: "var(--panel-background)" }}>
          <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            Lattice source registry · {assignedCount}/15
          </div>
          <ul className="mt-2 space-y-1">
            {rows.map((row) => {
              const active = row.slot.id === selected?.slot.id;
              const openVolumeVersion = row.result?.descriptors.find((descriptor) => descriptor.id === "openVolume")?.version;
              return (
                <li key={row.slot.id}>
                  <button
                    type="button"
                    className="w-full rounded border px-2 py-1.5 text-left text-[11px]"
                    style={{
                      borderColor: active ? "var(--accent)" : "var(--line)",
                      background: active ? "var(--accent-dark)" : "transparent",
                      color: "var(--ink)",
                    }}
                    onClick={() => setSelectedSlotId(row.slot.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{row.slot.code} · {row.slot.category}</span>
                      <span style={{ color: "var(--muted)" }}>
                        {row.result ? row.result.confidence : row.mesh ? "source" : "empty"}
                      </span>
                    </div>
                    <div className="truncate" data-slot-file={row.slot.id} style={{ color: "var(--muted)" }}>
                      {row.mesh ? row.mesh.filename : "Unassigned"}
                    </div>
                    {row.result?.status === "ready" && (
                      <div className="truncate" data-open-volume-version={openVolumeVersion ?? ""} style={{ color: "var(--muted)" }}>
                        Open Volume calculation version {openVolumeVersion ?? "missing"}
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <main className="flex min-h-0 flex-col gap-2 rounded border p-2" style={{ borderColor: "var(--line)", background: "var(--panel-background)" }}>
          <div className="text-[11px]" style={{ color: "var(--muted)" }}>
            {selected ? `${selected.slot.code} ${selected.slot.name}` : "No selection"}
            {selected?.mesh ? ` · ${selected.mesh.filename}` : " · no source assigned"}
          </div>
          <div className="min-h-0 flex-1 overflow-hidden rounded" style={{ border: "1px solid var(--line)" }}>
            <FormPreview mesh={selected?.mesh ?? null} unit={unit} upAxisMode={upAxisMode} />
          </div>
          {stats && drawn && selected?.mesh && (
            <div
              className="grid gap-2 text-[11px] sm:grid-cols-2"
              style={{ color: "var(--muted)" }}
              data-fidelity-slot={selected.slot.id}
              data-fidelity-file={selected.mesh.filename}
              data-source-vertices={stats.vertices}
              data-source-triangles={stats.triangles}
              data-source-bounds={`${stats.bounds.size[0].toFixed(2)} x ${stats.bounds.size[1].toFixed(2)} x ${stats.bounds.size[2].toFixed(2)}`}
              data-preview-vertices={drawn.vertices}
              data-preview-triangles={drawn.triangles}
              data-preview-bounds={`${drawn.size[0].toFixed(2)} x ${drawn.size[1].toFixed(2)} x ${drawn.size[2].toFixed(2)}`}
            >
              <div className="rounded border p-2" style={{ borderColor: "var(--line)" }}>
                <div className="uppercase tracking-wide">Lattice source OBJ</div>
                <div>{stats.vertices} vertices · {stats.triangles} triangles · {stats.faces} faces</div>
                <div>Bounds {stats.bounds.size[0].toFixed(2)} × {stats.bounds.size[1].toFixed(2)} × {stats.bounds.size[2].toFixed(2)} ft</div>
                <div>File buffer before placement</div>
              </div>
              <div className="rounded border p-2" style={{ borderColor: "var(--line)" }}>
                <div className="uppercase tracking-wide">Evaluations preview BufferGeometry</div>
                <div>{drawn.vertices} vertices · {drawn.triangles} triangles</div>
                <div>Drawn bounds {drawn.size[0].toFixed(2)} × {drawn.size[1].toFixed(2)} × {drawn.size[2].toFixed(2)} ft</div>
                <div>Unit {unit} · up {resolvedUp(selected.mesh.upAxis, upAxisMode)} · identity placement · display Y is spec Z</div>
              </div>
              <div className="sm:col-span-2 text-[11px]">
                {fidelityRows.filter((row) => row.mesh).every((row) => row.match)
                  ? `Fidelity match on ${fidelityRows.filter((row) => row.mesh).length} assigned source${fidelityRows.filter((row) => row.mesh).length === 1 ? "" : "s"}.`
                  : `Fidelity mismatch: ${fidelityRows.filter((row) => row.mesh && !row.match).map((row) => row.slot.id).join(", ") || "selected"}.`}
              </div>
            </div>
          )}
          {selected?.result?.status === "ready" && (
            <>
              <p className="text-[11px]" style={{ color: "var(--muted)" }}>
                Each displayed descriptor is ranked across the {analyzedCount} analyzed form{analyzedCount === 1 ? "" : "s"} in this session. Rank 1 is the weakest result and the highest rank is the strongest. Open Volume calls those ends the least and most open volume. Neither rank is a grade of architectural quality.
              </p>
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 xl:grid-cols-4">
                {VISIBLE_DESCRIPTORS.map(({id}) => selected.result!.descriptors.find(descriptor=>descriptor.id===id)).filter((descriptor): descriptor is NonNullable<typeof descriptor> => Boolean(descriptor)).map((descriptor) => (
                  <button
                    key={descriptor.id}
                    type="button"
                    className="rounded border px-2 py-1 text-left text-[11px]"
                    style={{
                      borderColor: explain?.id === descriptor.id ? "var(--accent)" : "var(--line)",
                      color: "var(--ink)",
                    }}
                    onClick={() => setExplainId(descriptor.id)}
                  >
                    <div style={{ color: "var(--muted)" }}>{descriptor.name}</div>
                    <div className="descriptor-rank text-base font-semibold">
                      {descriptor.comparativeRank ?? (!Number.isFinite(descriptor.absoluteScore) ? "n/a" : "—")}
                      {descriptor.comparativeRank !== undefined && descriptor.cohortSize ? <span className="descriptor-rank-of"> / {descriptor.cohortSize}</span> : null}
                    </div>
                    <div className="descriptor-rank-label text-[10px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                      Rank (higher is stronger) · score {Number.isFinite(descriptor.absoluteScore) ? descriptor.absoluteScore.toFixed(1) : "n/a"}
                    </div>
                  </button>
                ))}
              </div>
              <div className="overflow-auto">
                <div className="text-[11px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>Evaluation matrix · score / 100 and comparative rank (higher is stronger)</div>
                <table className="mt-1 w-full text-[10px]">
                  <thead>
                    <tr>
                      <th className="px-1 py-1 text-left">Form</th>
                      {VISIBLE_DESCRIPTORS.map((descriptor) => (
                        <th key={descriptor.id} className="px-1 py-1 text-right">{descriptor.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.filter((row) => row.result?.status === "ready").map((row) => (
                      <tr key={row.slot.id}>
                        <td className="px-1 py-1" data-open-volume-version={row.result?.descriptors.find((item) => item.id === "openVolume")?.version ?? ""}>
                          {row.slot.id}
                          <div>{row.result?.descriptors.find((item) => item.id === "openVolume")?.version ?? ""}</div>
                        </td>
                        {VISIBLE_DESCRIPTORS.map((descriptor) => {
                          const local = row.result?.descriptors.find((item) => item.id === descriptor.id);
                          const shown = local?.comparativeRank ?? (local && !Number.isFinite(local.absoluteScore) ? "n/a" : "—");
                          return <td key={descriptor.id} className="px-1 py-1 text-right" title={local?.unavailableReason}><div>{local && Number.isFinite(local.absoluteScore) ? local.absoluteScore.toFixed(1) : 'N/A'}</div><div>Rank {shown}{local?.cohortSize ? ` of ${local.cohortSize}` : ''}</div><div>{local?.version}</div></td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </main>

        <aside className="min-h-0 overflow-auto rounded border p-3" style={{ borderColor: "var(--line)", background: "var(--panel-background)" }}>
          <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            Explain Score
          </div>
          {!selected?.result || !explain ? (
            <p className="mt-3 text-[12px]" style={{ color: "var(--muted)" }}>
              {selected?.mesh ? "Press Analyze All Forms. v4 measures every descriptor on the original surfaces: floor samples, clearances, levels, mesh sightlines, voids, and verified movement routes." : "Assign a source OBJ in Lattice."}
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              <div>
                <div className="text-[13px] font-semibold uppercase tracking-wide">{explain.name}</div>
                <div className="mt-2 text-[11px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>Session rank</div>
                <div className="descriptor-rank text-3xl font-semibold" style={{ color: "var(--accent)" }}>
                  {selectedSessionRank ? `${selectedSessionRank.rank} / ${selectedSessionRank.cohortSize}` : "—"}
                </div>
                <div className="mt-1 text-[12px]">
                  {!Number.isFinite(explain.absoluteScore)
                    ? `Not ranked. ${explain.unavailableReason ?? "The geometry offered no evidence for this descriptor."}`
                    : selectedSessionRank
                      ? (explain.id === "openVolume"
                        ? `Rank ${selectedSessionRank.rank} of ${selectedSessionRank.cohortSize} among analyzed forms in this session. 1 is the least open volume. ${selectedSessionRank.cohortSize} is the most.`
                        : explain.id === "sequential"
                          ? `Rank ${selectedSessionRank.rank} of ${selectedSessionRank.cohortSize} among analyzed forms in this session. Ranked by verified vertical gain, then higher levels reached. 1 is the least ascent. ${selectedSessionRank.cohortSize} is the most.`
                        : `Rank ${selectedSessionRank.rank} of ${selectedSessionRank.cohortSize} among analyzed forms in this session. 1 is the weakest ${explain.name}. ${selectedSessionRank.cohortSize} is the strongest.`)
                      : "Press Analyze All Forms to rank the loaded session forms."}
                </div>
                <div className="mt-3 text-[11px] uppercase tracking-wide" style={{ color: "var(--muted)" }} data-calculation-version={explain.version ?? ""}>{explain.id === "sequential" ? "Verified vertical gain" : "Absolute score"} · {explain.id === "openVolume" ? "calculation version " : ""}{explain.version ?? "v3.5"}</div>
                <div className="text-[18px] font-semibold" data-explain-score={Number.isFinite(explain.absoluteScore) ? explain.absoluteScore.toFixed(2) : "unavailable"}>
                  {Number.isFinite(explain.absoluteScore)
                    ? (explain.id === "sequential" ? `${explain.absoluteScore.toFixed(1)} ft` : explain.absoluteScore.toFixed(1))
                    : "Unavailable"}
                </div>
                <div className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>
                  {explain.id === "sequential"
                    ? "Verified rise above the main entry, in feet. Rank uses this gain first, then higher levels reached. Ties keep both measurements. A form with no verified upward connection is 0. This is not the previous 0–100 Sequential blend."
                    : explain.id === "centralized" ? (explain.version === "centralized-verified-v2.0.0" ? "The score combines confirmed gathering suitability (40%), circulation convergence (40%), and reachability (20%)." : "Historical network centralization. Use spatial verification to review gathering regions and circulation for the 40/40/20 method.") : "0–100 from fixed calibration thresholds. The rank is this score's place among the analyzed forms in this session. A genuine zero is ranked. n/a is reserved for a processing failure."}
                </div>
                {explain.id === "openVolume" && explain.evidence?.measurements && (
                  <div className="mt-2 text-[11px]" style={{ color: "var(--muted)" }} data-continuous-field>
                    {typeof explain.evidence.measurements.continuousFieldFloorFt2 === "number"
                      ? `Continuous field ${Number(explain.evidence.measurements.continuousFieldFloorFt2).toFixed(0)} ft² · ${Number(explain.evidence.measurements.continuousFieldVolumeFt3 ?? 0).toFixed(0)} ft³${typeof explain.evidence.measurements.continuousFieldShare === "number" ? ` · ${Math.round(Number(explain.evidence.measurements.continuousFieldShare) * 100)}% of qualifying floor` : ""}. Disconnected qualifying floor is not counted.`
                      : "Continuous-field area and volume are not in this cached result."}
                  </div>
                )}
                {explain.id === "centralized" && explain.evidence?.measurements && (
                  <div className="mt-2 space-y-1 text-[11px]" style={{ color: "var(--muted)" }}>
                    <div>Primary region: {explain.evidence.measurements.primaryRegion ?? "unavailable"} · Spatial regions: {explain.evidence.measurements.spatialNodes} · Verified connections: {explain.evidence.measurements.verifiedConnections}</div>
                    <div>Connected components: {explain.evidence.measurements.connectedComponents} · Regions in primary system: {explain.evidence.measurements.regionsInPrimarySystem} · Outside it: {explain.evidence.measurements.disconnectedRegions}</div>
                    <div>Geometric centrality (3D diagnostic): {typeof explain.evidence.measurements.geometricCentrality === "number" ? Number(explain.evidence.measurements.geometricCentrality).toFixed(3) : "unavailable"} · Previous geometric score v4.3.0: {typeof explain.evidence.measurements.legacyV430Score === "number" ? Number(explain.evidence.measurements.legacyV430Score).toFixed(1) : "unavailable"}</div>
                    <div>Confidence: {explain.evidence.measurements.confidence}. {explain.evidence.measurements.graphType}. This score is not a measure of architectural quality.</div>
                    <div className="font-semibold" style={{ color: "#D6AD4F" }}>{explain.evidence.measurements.gatheringStatus ?? "Gathering Space Not Reliably Identified"}</div>
                    <div>Gathering region: {explain.evidence.measurements.gatheringRegion ?? "unavailable"} · Continuous area: {explain.evidence.measurements.gatheringAreaFt2 ?? "—"} ft² · Mean clear height: {typeof explain.evidence.measurements.gatheringClearHeightFt === "number" ? Number(explain.evidence.measurements.gatheringClearHeightFt).toFixed(1) : "—"} ft · Estimated volume: {typeof explain.evidence.measurements.gatheringVolumeFt3 === "number" ? Number(explain.evidence.measurements.gatheringVolumeFt3).toFixed(0) : "—"} ft³</div>
                    <div>Gathering harmonic closeness: {explain.evidence.measurements.gatheringHarmonic ?? "—"} · Betweenness: {explain.evidence.measurements.gatheringBetweenness ?? "—"} · Verified connections: {explain.evidence.measurements.gatheringConnections}</div>
                    <div>{explain.evidence.measurements.gatheringRationale}</div>
                    <details><summary>Excluded gathering regions</summary>{explain.evidence.measurements.gatheringExclusions}</details>
                  </div>
                )}
                <div className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>
                  {explain.id === "centralized" ? "Graph evidence confidence: low" : `Confidence ${selected.result.confidence}`}
                  {explain.relativePercentile !== undefined ? ` · percentile ${explain.relativePercentile}` : ""}
                  {" · "}{selected.slot.code} · {slotById(selected.slot.id)?.category}
                </div>
              </div>
              <ul className="space-y-2">
                {explain.components.map((component) => (
                  <li key={component.name} className="text-[12px]">
                    <div className="flex items-center justify-between gap-2">
                      <span style={{ color: "var(--muted)" }}>{component.name}</span>
                      <span className="font-medium">{component.status === "unavailable" ? "unavailable" : component.value}</span>
                    </div>
                    <div className="text-[10px]" style={{ color: "var(--muted)" }}>
                      {component.status === "unavailable"
                        ? `${component.reason ?? "No evidence."} Left out of the score; remaining weights renormalized.`
                        : explain.id === "openVolume" && !explain.evidence
                          ? `raw ${component.raw ?? "—"} ${component.rawUnit ?? ""}. This places the form. It is not the rating.`
                          : explain.id === "sequential"
                            ? `raw ${typeof component.raw === "number" ? Number(component.raw.toFixed(3)) : "—"} ${component.rawUnit ?? ""}. ${component.name === "Verified Vertical Gain" ? "Primary rank key." : "Secondary rank key."}`
                          : `raw ${typeof component.raw === "number" ? Number(component.raw.toFixed(3)) : "—"} ${component.rawUnit ?? ""} · weight ${Math.round(component.weight * 100)}% · contribution ${component.contribution ?? 0}`}
                      {component.formula ? ` · ${component.formula}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
              {selected.result.raw && models[selected.mesh?.id ?? ""] && (
                <div className="border-t pt-3 text-[11px]" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>
                  <div>Analysis clone uses the same imported vertex buffer.</div>
                  <div>TileModel vertices {models[selected.mesh!.id].vertexCount} · faces {models[selected.mesh!.id].faceCount}</div>
                  <div>Occupied cells {selected.result.raw.occupiedCells} · void {selected.result.raw.voidCells}</div>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
      <DescriptorComparison
        rows={rows.map((row) => ({
          slotId: row.slot.id,
          code: row.slot.code,
          name: row.slot.name,
          mesh: row.mesh,
          result: row.result,
          model: row.mesh ? models[row.mesh.id] : undefined,
        }))}
        descriptorId={explainId}
        onDescriptor={setExplainId}
        unit={unit}
        upAxisMode={upAxisMode}
      />
    </div>
  );
}
