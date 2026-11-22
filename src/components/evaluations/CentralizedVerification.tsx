"use client";
import { useEffect, useState } from 'react';
import type { ImportedObj, UnitName, UpAxisMode } from '../lattice/types';
import { resolvedUp, UNIT_TO_FEET } from '../lattice/types';
import type { V4Context } from './v4/evaluateV4';
import type { RegionReconstruction } from './v4/architecturalRegions';
import { regionDiagnosticSvg } from './v4/architecturalRegionDiagnostics';
import { validateVerification, scoreVerifiedDestinations, type SpatialVerification, type RegionReview } from './v4/spatialVerification';
import { createSpatialReview } from './v4/spatialReviewFactory';
import type { DescriptorResult } from './objDescriptorAnalysis';
import { geometryHash, verifiedResult, reviewKey, pendingCentralized } from './v4/verifiedCentralizedResult';
type Item = {
    ctx: V4Context;
    reconstruction: RegionReconstruction;
    review: SpatialVerification;
};
export default function CentralizedVerification({ meshes, unit, upAxisMode, onApply }: {
    meshes: ImportedObj[];
    unit: UnitName;
    upAxisMode: UpAxisMode;
    onApply: (id: string, result: DescriptorResult) => boolean;
}) {
    const [items, setItems] = useState<Item[]>([]), [active, setActive] = useState(0), [regionId, setRegionId] = useState(0), [connection, setConnection] = useState(0), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [diagnostics, setDiagnostics] = useState(false);
    const [target, setTarget] = useState(0), [routeText, setRouteText] = useState('');
    useEffect(() => { setItems([]); }, [meshes, unit, upAxisMode]);
    const item = items[active], review = item?.review, region = review?.regions.find(r => r.id === regionId), scores = review ? scoreVerifiedDestinations(review) : [], selected = scores.find(s => s.region.id === regionId);
    const storage = (r: SpatialVerification) => reviewKey(r.filename, r.geometryHash);
    function edit(update: (r: SpatialVerification) => SpatialVerification) { if (!item)
        return; try {
        const next = update(structuredClone(item.review));
        next.updatedAt = new Date().toISOString();
        validateVerification(next, next.geometryHash, item.review.regions);
        localStorage.setItem(storage(next), JSON.stringify(next));
        setItems(old => old.map((x, i) => i === active ? { ...x, review: next } : x));
        onApply(next.sourceId, pendingCentralized('Spatial review changed. Apply the reviewed result after confirming coverage.'));
        setMessage('Saved spatial review on this computer. Export a copy for transfer.');
    }
    catch (e) {
        setMessage(String(e));
    } }
    async function load() {
        setBusy(true);
        setMessage('');
        try {
            const { buildV4Context } = await import('./v4/evaluateV4');
            const { centralizedContext } = await import('./v4/centralizedContext');
            const { reconstructArchitecturalRegions } = await import('./v4/architecturalRegions');
            const next: Item[] = [];
            const notices: string[] = [];
            for (const mesh of meshes) {
                await new Promise(resolve => setTimeout(resolve, 0));
                const up = resolvedUp(mesh.upAxis, upAxisMode), hash = await geometryHash(mesh, up, unit);
                const ctx = centralizedContext(buildV4Context({ positions: mesh.positions, faces: mesh.faces, up, unitScale: UNIT_TO_FEET[unit] }, mesh.id)), reconstruction = reconstructArchitecturalRegions(ctx, { enabled: true })!;
                let review = createSpatialReview(ctx, reconstruction, { hash, id: mesh.id, filename: mesh.filename, unit, up });
                const saved = localStorage.getItem(storage(review)) ?? localStorage.getItem(`luv-spatial-review:${review.filename}`);
                if (saved) {
                    try {
                        review = { ...validateVerification(JSON.parse(saved), hash, review.regions), sourceId: mesh.id };
                    }
                    catch {
                        notices.push(`${mesh.filename}: previous annotations retained but not applied because geometry/settings changed.`);
                    }
                }
                next.push({ ctx, reconstruction, review });
            }
            setItems(next);
            setActive(0);
            setRegionId(next[0]?.review.regions[0]?.id ?? 0);
            setMessage(notices.join(' '));
        }
        catch (e) {
            setMessage(String(e));
        }
        finally {
            setBusy(false);
        }
    }
    function saveFile() { if (!review)
        return; const url = URL.createObjectURL(new Blob([JSON.stringify(review, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = review.filename + '.spatial-review.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    function apply() {
        if (!review || !item)
            return;
        const best = scores.find(s => s.score !== null);
        if (!best || !best.metrics) {
            setMessage('Review incomplete: ' + (scores[0]?.reasons.join(' ') ?? 'Confirm at least one gathering region.'));
            return;
        }
        const applied = onApply(review.sourceId, verifiedResult(review, item.ctx));
        setMessage(applied ? 'Applied the highest-scoring confirmed destination to Centralized.' : 'Analyze the models first, then apply this verified result.');
    }
    const changeRegion = (field: keyof RegionReview, value: unknown) => edit(r => ({ ...r, coverageConfirmed: false, regions: r.regions.map(x => x.id === regionId ? { ...x, [field]: value } : x) }));
    return <details className="rounded border p-3 text-sm">
    <summary>Centralized · verify regions and circulation</summary>
    <p>Review at least 100 ft² of continuous floor and 10 ft of clear width. Enter measured headroom or confirm open sky. A usable 7 ft gallery can qualify.</p>
    <p>Select measured regions in the plan and 3D views, classify their use, then review each connection. Gold indicates the selected region, not yet a verified gathering destination.</p>
    <button disabled={busy || !meshes.length} onClick={() => void load()}>{busy ? 'Reading model geometry…' : 'Load spatial review'}</button>
    <p role="status">{message}</p>{review && item && <>
  <label>Model <select value={active} onChange={e => { const n = Number(e.target.value); setActive(n); setRegionId(items[n].review.regions[0]?.id ?? 0); setConnection(0); }}>{items.map((x, i) => <option key={x.review.sourceId} value={i}>{x.review.filename}</option>)}</select>
        </label>
  <label>Region <select value={regionId} onChange={e => setRegionId(Number(e.target.value))}>{review.regions.map(r => <option key={r.id} value={r.id}>R{r.id} · z {r.levelFeet.toFixed(2)}′ · {r.area.toFixed(1)} ft² · {r.role}</option>)}</select>
        </label>
  <label>
        <input type="checkbox" checked={diagnostics} onChange={e => setDiagnostics(e.target.checked)}/> All spatial diagnostics</label>
  <div className="grid grid-cols-2 gap-2">{[false, true].map(isometric => <img key={String(isometric)} alt={`${review.filename} ${isometric ? '3D' : 'plan'} selected region R${regionId}`} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(regionDiagnosticSvg(item.ctx, item.reconstruction, { isometric, levelId: isometric ? undefined : item.reconstruction.regions.find(r => r.id === regionId)?.levelId, selectedRegion: diagnostics ? undefined : regionId, reviewRoutes: review.connections.filter(c => c.state === 'connected' && (c.from === regionId || c.to === regionId)).map(c => c.path) }))}`}/>)}</div>
  {region && <fieldset className="grid gap-2 border p-3">
            <legend>R{region.id} · source centroid {item.reconstruction.regions.find(r => r.id === region.id)?.centroid.map(n => n.toFixed(2)).join(', ')} ft</legend>
            <label>Use <select value={region.role} onChange={e => changeRegion('role', e.target.value)}>{['unknown', 'occupied', 'gathering', 'transition', 'excluded'].map(v => <option key={v}>{v}</option>)}</select>
            </label>{(['area', 'levelFeet', 'clearHeight', 'width'] as const).map(k => <label key={k}>{({ area: 'Usable area', levelFeet: 'Floor elevation', clearHeight: 'Clear height', width: 'Unobstructed width' })[k]} ({k === 'area' ? 'ft²' : 'ft'}) <input type="number" step="0.1" value={region[k] ?? ''} onChange={e => changeRegion(k, e.target.value === '' ? null : Number(e.target.value))}/>
                </label>)}<label>
            <input type="checkbox" checked={region.openSky} onChange={e => changeRegion('openSky', e.target.checked)}/> Open to sky</label>
            <label>Review / correction evidence <input value={region.note} onChange={e => changeRegion('note', e.target.value)}/>
            </label>
            </fieldset>}
  <fieldset>
        <legend>Proposed connections (each requires confirmation)</legend>
        <select value={connection} onChange={e => setConnection(Number(e.target.value))}>{review.connections.map((c, i) => <option key={i} value={i}>R{c.from} → R{c.to} · {c.type} · {c.state}</option>)}</select>{review.connections[connection] && <>
            <p>{review.connections[connection].note}</p>
            <label>Connection review evidence <input value={review.connections[connection].note} onChange={e => edit(r => ({ ...r, coverageConfirmed: false, connections: r.connections.map((c, i) => i === connection ? { ...c, note: e.target.value } : c) }))}/>
            </label>
            <p>Route coordinates: {review.connections[connection].path.map(p => p.map(n => n.toFixed(2)).join(',')).join(' → ')}</p>
            <button onClick={() => setRegionId(review.connections[connection].from)}>Locate first region</button>
            <button onClick={() => setRegionId(review.connections[connection].to)}>Locate second region</button>
            <select value={review.connections[connection].state} onChange={e => edit(r => ({ ...r, coverageConfirmed: false, connections: r.connections.map((c, i) => i === connection ? { ...c, state: e.target.value as 'unknown' | 'connected' | 'separated' } : c) }))}>{['unknown', 'connected', 'separated'].map(v => <option key={v}>{v}</option>)}</select>
            <select value={review.connections[connection].type} onChange={e => edit(r => ({ ...r, coverageConfirmed: false, connections: r.connections.map((c, i) => i === connection ? { ...c, type: e.target.value as 'doorway' | 'passage' | 'stair' | 'ramp' } : c) }))}>{['doorway', 'passage', 'stair', 'ramp'].map(v => <option key={v}>{v}</option>)}</select>
            </>}</fieldset>
  <fieldset>
        <legend>Add a missing relationship from selected R{regionId}</legend>
        <label>Other region <select value={target} onChange={e => setTarget(Number(e.target.value))}>{review.regions.map(r => <option key={r.id} value={r.id}>R{r.id}</option>)}</select>
        </label>
        <label>Route waypoints in model feet, Z up (x,y,z; x,y,z) <input value={routeText} onChange={e => setRouteText(e.target.value)}/>
        </label>
        <button onClick={() => { try {
            if (target === regionId)
                throw new Error('Select two different regions.');
            const path = routeText.trim() ? routeText.split(';').map(v => v.split(',').map(Number) as [
                number,
                number,
                number
            ]) : [];
            if (path.some(p => p.length !== 3 || p.some(v => !Number.isFinite(v)) || !item.ctx.field.samples.some(s => Math.hypot(...s.position.map((v, i) => v - p[i])) <= 1.5)))
                throw new Error('Each waypoint must lie within 1.5 ft of a measured source floor sample.');
            if (path.length && (path.length < 2 || ![regionId, target].every((id, i) => review.regions.find(r => r.id === id)!.boundaryCells.some(p => Math.hypot(...p.map((v, j) => v - path[i === 0 ? 0 : path.length - 1][j])) <= 1.5))))
                throw new Error('Route endpoints must lie in the selected regions.');
            edit(r => ({ ...r, coverageConfirmed: false, connections: [...r.connections, { from: regionId, to: target, state: 'unknown', type: 'passage', path, note: 'User-proposed source-aligned route; review its status and type.' }] }));
            setConnection(review.connections.length);
        }
        catch (e) {
            setMessage(String(e));
        } }}>Add relationship for review</button>
        <p>Leave waypoints blank to record a separated or unknown relationship. Connected routes require at least two source-aligned points.</p>
        </fieldset>
  <label>
        <input type="checkbox" checked={review.coverageConfirmed} onChange={e => edit(r => ({ ...r, coverageConfirmed: e.target.checked }))}/> I reviewed all occupiable regions and possible connections; excluded regions are not occupied origins.</label>
  <p>{selected?.metrics ? `Selected destination: gathering ${(selected.metrics.suitability * 40).toFixed(1)}/40 · convergence ${(selected.metrics.convergence * 40).toFixed(1)}/40 · accessibility ${selected.metrics.reachability === null ? 'unknown' : (selected.metrics.reachability * 20).toFixed(1) + '/20'} · total ${selected.score === null ? 'pending verification' : selected.score.toFixed(1)}` : 'Select and confirm a gathering region to calculate its contributions.'}</p>
        <p>{selected?.reasons.join(' ')}</p>
        <ul>{scores.map(s => <li key={s.region.id}>
            <button onClick={() => setRegionId(s.region.id)}>Gathering candidate R{s.region.id}</button>: {s.score === null ? 'pending — ' + s.reasons.join(' ') : s.score.toFixed(1) + '/100'}</li>)}</ul>
        <button onClick={apply}>Apply verified Centralized result</button>
        <button onClick={saveFile}>Export spatial metadata</button>
        <label>Import metadata <input type="file" accept=".json" onChange={async (e) => { const f = e.target.files?.[0]; if (!f)
            return; try {
            const imported = validateVerification(JSON.parse(await f.text()), review.geometryHash, review.regions);
            edit(() => ({ ...imported, sourceId: review.sourceId, filename: review.filename, unit: review.unit, up: review.up }));
        }
        catch (err) {
            setMessage(String(err));
        } }}/>
        </label>
 </>}</details>;
}
