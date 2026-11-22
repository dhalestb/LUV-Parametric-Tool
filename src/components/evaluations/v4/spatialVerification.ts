import type { Vec3 } from './geometry';
import { gatheringMetrics } from './gatheringMetrics';
export const VERIFICATION_VERSION = 'spatial-verification-v1';
export const VERIFIED_CENTRALIZED_VERSION = 'centralized-verified-v2.0.0';
// Area and width retain the architectural gates. The approved seven-foot
// reference scales suitability continuously for a confirmed occupiable region.
export const GATHERING_ELIGIBILITY = { minimumArea: 100, minimumWidth: 10 };
export type RegionReview = {
    id: number;
    sampleIds: number[];
    boundaryCells: Vec3[];
    levelFeet: number;
    area: number;
    clearHeight: number | null;
    openSky: boolean;
    width: number | null;
    role: 'unknown' | 'occupied' | 'gathering' | 'transition' | 'excluded';
    note: string;
};
export type ConnectionReview = {
    from: number;
    to: number;
    state: 'unknown' | 'connected' | 'separated';
    type: 'doorway' | 'passage' | 'stair' | 'ramp';
    path: Vec3[];
    note: string;
};
export type SpatialVerification = {
    version: typeof VERIFICATION_VERSION;
    method: typeof VERIFIED_CENTRALIZED_VERSION;
    geometryHash: string;
    sourceId: string;
    filename: string;
    unit: string;
    up: string;
    regions: RegionReview[];
    connections: ConnectionReview[];
    coverageConfirmed: boolean;
    updatedAt: string;
};
export function validateVerification(value: unknown, hash: string, reference?: RegionReview[]): SpatialVerification {
    const v = value as SpatialVerification;
    if (!v || v.version !== VERIFICATION_VERSION || v.method !== VERIFIED_CENTRALIZED_VERSION || v.geometryHash !== hash)
        throw new Error('Annotations do not match this geometry, units, orientation or methodology. Re-review required.');
    if (!Array.isArray(v.regions) || !Array.isArray(v.connections) || typeof v.coverageConfirmed !== 'boolean')
        throw new Error('Invalid spatial metadata.');
    const ids = new Set<number>();
    for (const r of v.regions) {
        if (ids.has(r.id) || !Number.isInteger(r.id) || !Number.isFinite(r.area) || r.area <= 0 || !Number.isFinite(r.levelFeet) || !Array.isArray(r.sampleIds) || !r.sampleIds.length || r.sampleIds.some(id => !Number.isInteger(id)) || typeof r.openSky !== 'boolean' || !Array.isArray(r.boundaryCells) || !r.boundaryCells.length || r.boundaryCells.some(p => !Array.isArray(p) || p.length !== 3 || p.some(x => !Number.isFinite(x))) || !['unknown', 'occupied', 'gathering', 'transition', 'excluded'].includes(r.role) || r.width !== null && (!Number.isFinite(r.width) || r.width <= 0) || r.clearHeight !== null && (!Number.isFinite(r.clearHeight) || r.clearHeight < 0))
            throw new Error('Invalid region measurement.');
        ids.add(r.id);
    }
    for (const c of v.connections)
        if (c.from === c.to || !ids.has(c.from) || !ids.has(c.to) || !['connected', 'separated', 'unknown'].includes(c.state) || !['doorway', 'passage', 'stair', 'ramp'].includes(c.type) || !Array.isArray(c.path) || c.path.some(p => p.length !== 3 || p.some(x => !Number.isFinite(x))) || c.state === 'connected' && c.path.length < 2)
            throw new Error('Invalid connection or missing model-coordinate route.');
    if (reference && (reference.length !== v.regions.length || reference.some(r => { const found = v.regions.find(x => x.id === r.id); return !found || JSON.stringify(found.sampleIds) !== JSON.stringify(r.sampleIds) || JSON.stringify(found.boundaryCells) !== JSON.stringify(r.boundaryCells); })))
        throw new Error('Region support changed. Reconstruct and review this geometry again.');
    const support = (reference ?? v.regions).flatMap(r => r.boundaryCells);
    const near = (p: Vec3, points: Vec3[]) => points.some(q => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) <= 1.5);
    for (const c of v.connections)
        if (c.state === 'connected') {
            if (c.path.some(p => !near(p, support)))
                throw new Error('Route leaves measured model support. Re-review its coordinates.');
            const a = v.regions.find(r => r.id === c.from)!, b = v.regions.find(r => r.id === c.to)!;
            // Reconstruction may store either direction; both are valid for an undirected edge.
            if (!((near(c.path[0], a.boundaryCells) && near(c.path.at(-1)!, b.boundaryCells)) || (near(c.path[0], b.boundaryCells) && near(c.path.at(-1)!, a.boundaryCells))))
                throw new Error('Route endpoints do not match the connected regions.');
            if (v.connections.some(other => other.state === 'separated' && ((other.from === c.from && other.to === c.to) || (other.from === c.to && other.to === c.from))))
                throw new Error('The same regions cannot be both connected and physically separated.');
        }
    return v;
}
export function scoreVerifiedDestinations(v: SpatialVerification) {
    validateVerification(v, v.geometryHash);
    const adj = new Map(v.regions.map(r => [r.id, new Set<number>()]));
    for (const c of v.connections)
        if (c.state === 'connected' && [c.from, c.to].every(id => v.regions.find(r => r.id === id)!.role !== 'excluded')) {
            adj.get(c.from)!.add(c.to);
            adj.get(c.to)!.add(c.from);
        }
    return v.regions.filter(r => r.role === 'gathering').map(g => {
        const reasons: string[] = [];
        if (!v.coverageConfirmed)
            reasons.push('Confirm occupied-region and connection review coverage.');
        if (v.regions.some(r => r.role === 'unknown'))
            reasons.push('Unclassified regions remain.');
        if (g.width === null)
            reasons.push('Confirm unobstructed gathering width.');
        if (g.clearHeight === null && !g.openSky)
            reasons.push('Confirm clear height or open sky.');
        if (g.area < GATHERING_ELIGIBILITY.minimumArea || g.width !== null && g.width < GATHERING_ELIGIBILITY.minimumWidth)
            reasons.push('Gathering eligibility requires at least 100 ft² and 10 ft unobstructed width.');
        if (!g.openSky && g.clearHeight === 0)
            reasons.push('No usable overhead volume.');
        const reached = new Set([g.id]), queue = [g.id];
        for (let i = 0; i < queue.length; i++)
            for (const n of adj.get(queue[i])!) {
                if (!reached.has(n)) {
                    reached.add(n);
                    queue.push(n);
                }
            }
        const branches = new Set<number>();
        const seen = new Set([g.id]);
        for (const n of adj.get(g.id)!) {
            if (seen.has(n))
                continue;
            branches.add(n);
            const q = [n];
            seen.add(n);
            for (let i = 0; i < q.length; i++)
                for (const next of adj.get(q[i])!) {
                    if (!seen.has(next)) {
                        seen.add(next);
                        q.push(next);
                    }
                }
        }
        if (!branches.size)
            reasons.push('No confirmed approach to this destination.');
        const usableIds = new Set(v.regions.filter(r => r.role !== 'excluded').map(r => r.id));
        if (v.connections.some(c => c.state === 'unknown' && usableIds.has(c.from) && usableIds.has(c.to) && (reached.has(c.from) || reached.has(c.to)) && !adj.get(c.from)?.has(c.to)))
            reasons.push('An unresolved connection may change convergence or reachability.');
        let reachable = 0, unknown = 0, disconnected = 0;
        for (const r of v.regions.filter(r => r.id !== g.id && ['gathering', 'occupied'].includes(r.role))) {
            if (reached.has(r.id))
                reachable += r.area;
            else if (v.coverageConfirmed && [...reached].every(id => v.connections.some(c => c.state === 'separated' && ((c.from === id && c.to === r.id) || (c.to === id && c.from === r.id)))))
                disconnected += r.area;
            else
                unknown += r.area;
        }
        if (unknown)
            reasons.push(`${unknown.toFixed(1)} ft² of occupied origins have unknown reachability.`);
        const metrics = g.width === null || (g.clearHeight === null && !g.openSky) ? null : gatheringMetrics({ area: g.area, width: g.width, clearHeight: g.clearHeight, openSky: g.openSky, independentApproaches: branches.size, originsReachableArea: reachable, originsDisconnectedArea: disconnected, originsUnknownArea: unknown });
        if (metrics?.scoreLower === null)
            reasons.push('No other confirmed occupied origins.');
        return { region: g, metrics, approaches: branches.size, reasons, score: reasons.length ? null : metrics?.scoreLower ?? null };
    }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.region.id - b.region.id);
}
