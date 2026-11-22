import type { DescriptorResult } from '../objDescriptorAnalysis';
import type { ImportedObj, UnitName, UpAxis } from '../../lattice/types';
import { UNIT_TO_FEET } from '../../lattice/types';
import type { V4Context } from './evaluateV4';
import { PALETTE, patchLayer, polylineLayer, squarePatch } from './evidence';
import { scoreVerifiedDestinations, VERIFIED_CENTRALIZED_VERSION, validateVerification, type SpatialVerification } from './spatialVerification';
import { createSpatialReview } from './spatialReviewFactory';
export function pendingCentralized(reason = 'Review gathering use, clear width and circulation in Centralized spatial verification.'): DescriptorResult {
    return { id: 'centralized', name: 'Centralized', version: VERIFIED_CENTRALIZED_VERSION, available: false, absoluteScore: NaN, score: 0, components: [], unavailableReason: reason };
}
export function verifiedResult(review: SpatialVerification, ctx: V4Context): DescriptorResult {
    const scores = scoreVerifiedDestinations(review);
    const best = scores.find(s => s.score !== null);
    if (!best?.metrics)
        return pendingCentralized(scores[0]?.reasons.join(' ') || undefined);
    const m = best.metrics, names = ['Primary Gathering Spaces', 'Circulation Convergence', 'Accessibility'], values = [m.suitability, m.convergence, m.reachability!], weights = [.4, .4, .2], routes = review.connections.filter(c => c.state === 'connected' && (c.from === best.region.id || c.to === best.region.id)).map(c => c.path);
    const components = names.map((name, i) => ({ name, value: values[i] * 100, weight: weights[i], raw: values[i], contribution: values[i] * weights[i] * 100, status: 'measured' as const }));
    return { id: 'centralized', name: 'Centralized', score: Math.round(best.score!), absoluteScore: best.score!, available: true, version: VERIFIED_CENTRALIZED_VERSION, components, evidence: { descriptorId: 'centralized', version: VERIFIED_CENTRALIZED_VERSION, sourceId: review.sourceId, sourceHash: ctx.mesh.sourceHash, coordinateSystem: 'spec-feet-z-up', units: 'ft', validity: 'architectural-proxy', components: names.map((name, i) => ({ name, intent: 'User-reviewed architectural evidence', formula: i === 0 ? 'cbrt(min(A/200,1) × min(W/12,1) × min(H/7,1))' : i === 1 ? 'min(independent corridor branches/4,1)' : 'verified reachable origin area / occupied origin area', units: 'ratio', normalization: '0–1', weight: weights[i], raw: values[i], precise: values[i] * 100, status: 'measured', layerIds: ['ce-gathering', 'ce-approaches'] })), layers: [patchLayer({ id: 'ce-gathering', label: 'Confirmed gathering destination', color: PALETTE.gold, status: 'measured', components: names }, best.region.boundaryCells.map(p => squarePatch(p, ctx.field.sampleFeet))), polylineLayer({ id: 'ce-approaches', label: 'User-confirmed circulation approaches', color: PALETTE.cyan, status: 'verified', components: names }, routes)], measurements: { gatheringStatus: 'User-confirmed gathering destination', gatheringRegion: best.region.id, gatheringAreaFt2: best.region.area, gatheringClearHeightFt: best.region.clearHeight, gatheringConnections: best.approaches, gatheringRationale: '40/40/20 suitability, conservative independent branches and reviewed reachability.', metadataHash: review.geometryHash }, notes: ['Architectural review supplied by user; geometric reachability does not certify accessibility compliance.'] } };
}
export async function geometryHash(mesh: ImportedObj, up: UpAxis, unit: UnitName) {
    const bytes = new TextEncoder().encode(JSON.stringify({ positions: Array.from(mesh.positions), faces: mesh.faces.map(f => f.vertices), up, scale: UNIT_TO_FEET[unit] }));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
export function reviewKey(name: string, hash: string) { return 'luv-spatial-review:' + name + ':' + hash; }
export async function savedCentralizedResult(mesh: ImportedObj, up: UpAxis, unit: UnitName): Promise<DescriptorResult> {
    const hash = await geometryHash(mesh, up, unit);
    const saved = localStorage.getItem(reviewKey(mesh.filename, hash));
    if (!saved)
        return pendingCentralized();
    try {
        const { buildV4Context } = await import('./evaluateV4');
        const { centralizedContext } = await import('./centralizedContext');
        const { reconstructArchitecturalRegions } = await import('./architecturalRegions');
        const ctx = centralizedContext(buildV4Context({ positions: mesh.positions, faces: mesh.faces, up, unitScale: UNIT_TO_FEET[unit] }, mesh.id));
        const reconstruction = reconstructArchitecturalRegions(ctx, { enabled: true })!;
        const reference = createSpatialReview(ctx, reconstruction, { hash, id: mesh.id, filename: mesh.filename, unit, up });
        const review = validateVerification(JSON.parse(saved), hash, reference.regions);
        return verifiedResult({ ...review, sourceId: mesh.id, filename: mesh.filename }, ctx);
    }
    catch (error) {
        return pendingCentralized('Saved spatial review requires attention. ' + String(error));
    }
}
