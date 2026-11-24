import type { DescriptorResult } from '../objDescriptorAnalysis';
import type { ImportedObj, UnitName, UpAxis } from '../../lattice/types';
import { UNIT_TO_FEET } from '../../lattice/types';
import type { V4Context } from './evaluateV4';
import { PALETTE, patchLayer, polylineLayer, squarePatch } from './evidence';
import { evaluateFloors, VERIFIED_CENTRALIZED_VERSION, restoreReview, type SpatialVerification } from './spatialVerification';
import { createSpatialReview } from './spatialReviewFactory';
export function pendingCentralized(reason = 'Review gathering use, clear width and circulation in Centralized spatial verification.'): DescriptorResult {
    return { id: 'centralized', name: 'Centralized', version: VERIFIED_CENTRALIZED_VERSION, available: false, absoluteScore: NaN, score: 0, components: [], unavailableReason: reason };
}
export function verifiedResult(review: SpatialVerification, ctx: V4Context): DescriptorResult {
    const floors = evaluateFloors(review);
    const scored = floors.filter(f => f.score !== null);
    const floorResults = floors.map(f => ({level:f.level,candidates:f.destinations.map(d=>({region:d.region.id,area:d.region.area,percent:d.areaPercent,levelUsableArea:d.floorArea,patch:d.region.usablePatch})), score:f.score, primary:f.complete ? f.primary?.region.id : undefined,
        secondary:f.complete ? f.secondary.map(d=>d.region.id) : [], status:f.complete ? (f.primary ? 'Scored' : 'No gathering destination') : 'Pending floor review'}));
    const ready = scored.length > 0 && floors.every(f => f.complete);
    if (!scored.length) return {...pendingCentralized('Confirm gathering use, occupancy and approaches on each architectural floor.'), floorResults};
    const winners = scored.map(f => f.primary!);
    const mean = (numbers:number[]) => numbers.reduce((a,b)=>a+b,0)/numbers.length;
    const total = mean(scored.map(f=>f.score!));
    const names = ['Primary Gathering Spaces', 'Circulation Convergence', 'Accessibility'];
    const values = [mean(winners.map(d=>d.metrics!.suitability)), mean(winners.map(d=>d.metrics!.convergence)), mean(winners.map(d=>d.metrics!.reachability!))];
    const weights = [.4,.4,.2];
    const routes = scored.flatMap(f=>f.connections.filter(c=>c.state==='connected' && [c.from,c.to].includes(f.primary!.region.id) &&
        [c.from,c.to].every(id=>review.regions.find(r=>r.id===id)?.role!=='excluded')).map(c=>c.path));
    const components = names.map((name, i) => ({ name, value: values[i] * 100, weight: weights[i], raw: values[i], contribution: values[i] * weights[i] * 100, status: 'measured' as const }));
    return { id: 'centralized', name: 'Centralized', floorResults, score: ready ? Math.round(total) : 0, absoluteScore: ready ? total : NaN, available: ready, unavailableReason: ready ? undefined : "Other floors await review. Completed floor scores are available.", version: VERIFIED_CENTRALIZED_VERSION, components, evidence: { descriptorId: 'centralized', version: VERIFIED_CENTRALIZED_VERSION, sourceId: review.sourceId, sourceHash: ctx.mesh.sourceHash, coordinateSystem: 'spec-feet-z-up', units: 'ft', validity: 'architectural-proxy', components: names.map((name, i) => ({ name, intent: 'User-reviewed architectural evidence', formula: i === 0 ? 'A / (A + 200 ft²)' : i === 1 ? 'min(independent corridor branches/4,1)' : 'verified reachable origin area / occupied origin area', units: 'ratio', normalization: '0–1', weight: weights[i], raw: values[i], precise: values[i] * 100, status: 'measured', layerIds: ['ce-gathering', 'ce-approaches'] })), layers: [patchLayer({ id: 'ce-gathering', label: 'Confirmed gathering destination', color: PALETTE.gold, status: 'measured', components: names }, winners.flatMap(d => d.region.usablePatch ? [d.region.usablePatch] : d.region.boundaryCells.map(p => squarePatch(p, ctx.field.sampleFeet)))), polylineLayer({ id: 'ce-approaches', label: 'User-confirmed circulation approaches', color: PALETTE.cyan, status: 'verified', components: names }, routes)], measurements: { gatheringStatus: 'Primary gatherings by architectural floor', gatheringRationale: 'Equal mean of floor primary scores; reviewed floors without a qualifying destination are listed separately.', metadataHash: review.geometryHash }, notes: ['Architectural review supplied by user; geometric reachability does not certify accessibility compliance.'] } };
}
export async function geometryHash(mesh: ImportedObj, up: UpAxis, unit: UnitName) {
    const bytes = new TextEncoder().encode(JSON.stringify({ positions: Array.from(mesh.positions), faces: mesh.faces.map(f => f.vertices), up, scale: UNIT_TO_FEET[unit] }));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
export function reviewKey(name: string, hash: string) { return 'luv-spatial-review:v4:' + name + ':' + hash; }
export async function savedCentralizedResult(mesh: ImportedObj, up: UpAxis, unit: UnitName, slotId?: string): Promise<DescriptorResult> {
    const hash = await geometryHash(mesh, up, unit);
    const saved = localStorage.getItem(reviewKey(mesh.filename, hash)) ?? localStorage.getItem('luv-spatial-review:v3:'+mesh.filename+':'+hash) ?? localStorage.getItem('luv-spatial-review:'+mesh.filename+':'+hash);
    try {
        const { buildV4Context } = await import('./evaluateV4');
        const { centralizedContext } = await import('./centralizedContext');
        const { reconstructArchitecturalRegions } = await import('./architecturalRegions');
        const ctx = centralizedContext(buildV4Context({ positions: mesh.positions, faces: mesh.faces, up, unitScale: UNIT_TO_FEET[unit] }, mesh.id, { lobbySlotId: slotId }));
        const reconstruction = reconstructArchitecturalRegions(ctx, { enabled: true })!;
        const reference = await createSpatialReview(ctx, reconstruction, { hash, id: mesh.id, filename: mesh.filename, unit, up });
        const review = saved ? restoreReview(JSON.parse(saved),reference) : reference;
        return verifiedResult({ ...review, sourceId: mesh.id, filename: mesh.filename }, ctx);
    }
    catch (error) {
        return pendingCentralized('Saved spatial review requires attention. ' + String(error));
    }
}
