import type { Vec3 } from './geometry';
import { gatheringMetrics } from './gatheringMetrics';
export const VERIFICATION_VERSION = 'spatial-verification-v1';
export const VERIFIED_CENTRALIZED_VERSION = 'centralized-area-v4.0.0';
export type RegionReview = {
    id: number;
    sampleIds: number[];
    boundaryCells: Vec3[];
    levelFeet: number;
    floorFeet?: number;
    area: number;
    usableTotal?: number;
    usablePatch?: number[];
    clearHeight: number | null;
    openSky: boolean;
    width: number | null;
    role: 'candidate' | 'unknown' | 'occupied' | 'gathering' | 'transition' | 'excluded';
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
    confirmedFloors?: number[];
    updatedAt: string;
};
export function validateVerification(value: unknown, hash: string, reference?: RegionReview[]): SpatialVerification {
    const v = value as SpatialVerification;
    if (!v || v.version !== VERIFICATION_VERSION || v.method !== VERIFIED_CENTRALIZED_VERSION || v.geometryHash !== hash)
        throw new Error('Annotations do not match this geometry, units, orientation or methodology. Re-review required.');
    if (!Array.isArray(v.regions) || !Array.isArray(v.connections) || typeof v.coverageConfirmed !== 'boolean')
        throw new Error('Invalid spatial metadata.');
    if (v.confirmedFloors !== undefined && (!Array.isArray(v.confirmedFloors) || !v.confirmedFloors.every(Number.isFinite))) throw new Error('Invalid floor confirmations.');
    const ids = new Set<number>();
    for (const r of v.regions) {
        if (ids.has(r.id) || !Number.isInteger(r.id) || !Number.isFinite(r.area) || r.area < 0 || (r.usableTotal !== undefined && (!Number.isFinite(r.usableTotal) || r.usableTotal+1e-6<r.area)) || (r.floorFeet !== undefined && !Number.isFinite(r.floorFeet)) || !Number.isFinite(r.levelFeet) || !Array.isArray(r.sampleIds) || !r.sampleIds.length || r.sampleIds.some(id => !Number.isInteger(id)) || typeof r.openSky !== 'boolean' || !Array.isArray(r.boundaryCells) || !r.boundaryCells.length || r.boundaryCells.some(p => !Array.isArray(p) || p.length !== 3 || p.some(x => !Number.isFinite(x))) || !['candidate', 'unknown', 'occupied', 'gathering', 'transition', 'excluded'].includes(r.role) || r.width !== null && (!Number.isFinite(r.width) || r.width <= 0) || r.clearHeight !== null && (!Number.isFinite(r.clearHeight) || r.clearHeight < 0))
            throw new Error('Invalid region measurement.');
        ids.add(r.id);
    }
    for (const c of v.connections)
        if (c.from === c.to || !ids.has(c.from) || !ids.has(c.to) || !['connected', 'separated', 'unknown'].includes(c.state) || !['doorway', 'passage', 'stair', 'ramp'].includes(c.type) || !Array.isArray(c.path) || c.path.some(p => p.length !== 3 || p.some(x => !Number.isFinite(x))) || c.state === 'connected' && c.path.length < 2)
            throw new Error('Invalid connection or missing model-coordinate route.');
    if (reference && (reference.length !== v.regions.length || reference.some(r => { const found = v.regions.find(x => x.id === r.id); return !found || JSON.stringify(found.sampleIds) !== JSON.stringify(r.sampleIds) || JSON.stringify(found.boundaryCells) !== JSON.stringify(r.boundaryCells); })))
        throw new Error('Region support changed. Reconstruct and review this geometry again.');
    if(reference) for(const r of reference){
        const incoming=v.regions.find(s=>s.id===r.id)!;
        if(r.usableTotal!==undefined && (incoming.area!==r.area || incoming.usableTotal!==r.usableTotal || JSON.stringify(incoming.usablePatch)!==JSON.stringify(r.usablePatch)))
            throw new Error('Source-measured usable floor changed. Reconstruct this review.');
    }
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
function scoreFloor(v: SpatialVerification) {
    const adj = new Map(v.regions.map(r => [r.id, new Set<number>()]));
    for (const c of v.connections)
        if (c.state === 'connected' && [c.from, c.to].every(id => v.regions.find(r => r.id === id)!.role !== 'excluded')) {
            adj.get(c.from)!.add(c.to);
            adj.get(c.to)!.add(c.from);
        }
    return v.regions.filter(r => r.role === 'gathering' || r.role === 'candidate').map(g => {
        const reasons: string[] = [];
        if (g.role === 'candidate') reasons.push('Confirm gathering use on this floor.');
        if (!v.coverageConfirmed)
            reasons.push('Confirm occupied-region and connection review coverage.');
        if (v.regions.some(r => r.role === 'unknown' || r.role === 'candidate' && r.id !== g.id))
            reasons.push('Unclassified regions remain.');
        if(g.area<=0) reasons.push('No continuous usable floor area.');
        if(g.clearHeight===null && !g.openSky) reasons.push('Confirm open sky or missing overhead geometry.');
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
        const usableIds = new Set(v.regions.filter(r => r.role !== 'excluded').map(r => r.id));
        if (v.connections.some(c => c.state === 'unknown' && usableIds.has(c.from) && usableIds.has(c.to) && (reached.has(c.from) || reached.has(c.to)) && !adj.get(c.from)?.has(c.to)))
            reasons.push('An unresolved connection may change convergence or reachability.');
        // Once local coverage is confirmed, a component cut off even when all
        // potential edges are included has verified zero reachability from here.
        const possible = new Set(reached);
        const pending = [...possible];
        for (let i=0;i<pending.length;i++) {
            const id=pending[i];
            for(const c of v.connections) {
                if(c.state==='separated' || (c.from!==id && c.to!==id)) continue;
                const other=c.from===id?c.to:c.from;
                if(usableIds.has(other) && !possible.has(other)){possible.add(other);pending.push(other);}
            }
        }
        let reachable = 0, unknown = 0, disconnected = 0;
        for (const r of v.regions.filter(r => r.id !== g.id && ['gathering', 'occupied'].includes(r.role))) {
            if (reached.has(r.id))
                reachable += r.usableTotal ?? r.area;
            else if (v.coverageConfirmed && !possible.has(r.id))
                disconnected += r.usableTotal ?? r.area;
            else
                unknown += r.usableTotal ?? r.area;
        }
        if (unknown)
            reasons.push(`${unknown.toFixed(1)} ft² of occupied origins have unknown reachability.`);
        const metrics = gatheringMetrics({ area: g.area, width: g.width, clearHeight: g.clearHeight, openSky: g.openSky, independentApproaches: branches.size, originsReachableArea: reachable, originsDisconnectedArea: disconnected, originsUnknownArea: unknown });
        if (metrics?.scoreLower === null)
            reasons.push('No other confirmed occupied origins.');
        const floorArea=v.regions.reduce((sum,r)=>sum+(r.role==='excluded'?0:r.usableTotal??r.area),0);
        return { region: g, floorArea, areaPercent:floorArea>0?100*g.area/floorArea:null, metrics, approaches: branches.size, reasons, score: reasons.length ? null : metrics?.scoreLower ?? null };
    }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.region.id - b.region.id);
}

export function architecturalFloor(r: RegionReview) {
    return r.floorFeet ?? Number(r.levelFeet.toFixed(2));
}

export function evaluateFloors(v: SpatialVerification) {
    validateVerification(v, v.geometryHash);
    const groups = new Map<number, RegionReview[]>();
    for (const r of v.regions) {
        const floor = architecturalFloor(r);
        if (!groups.has(floor)) groups.set(floor, []);
        groups.get(floor)!.push(r);
    }
    return [...groups].sort(([a], [b]) => a-b).map(([level, regions]) => {
        const ids = new Set(regions.map(r => r.id));
        const connections = v.connections.filter(c => ids.has(c.from) && ids.has(c.to) &&
            c.path.slice(1,-1).every(p => regions.some(r => r.role !== 'excluded' && r.boundaryCells.some(q =>
                Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2]) <= 1.5))));
        const reviewed = v.coverageConfirmed || Boolean(v.confirmedFloors?.includes(level));
        const destinations = scoreFloor({...v, regions, connections, coverageConfirmed: reviewed});
        const complete = reviewed && regions.every(r => r.role !== 'unknown') && destinations.every(d => d.score !== null);
        const ranked = destinations.filter(d => d.score !== null);
        return {level, destinations, primary: ranked[0], secondary: ranked.slice(1), connections, complete,
            score: complete ? ranked[0]?.score ?? null : null};
    });
}
export function scoreVerifiedDestinations(v: SpatialVerification) {
    return evaluateFloors(v).flatMap(f => f.destinations);
}

/** Copy historical annotations into a fresh method-specific review. Each floor needs fresh coverage confirmation. */
export function restoreReview(raw: SpatialVerification, reference: SpatialVerification) {
    if (!['centralized-verified-v2.0.0','centralized-floor-v3.0.0'].includes(String(raw.method))) {
        // Drawing triangles are derived from the source and omitted from stored annotations.
        const persisted={...raw, regions:raw.regions.map(r=>({...r,usablePatch:reference.regions.find(x=>x.id===r.id)?.usablePatch}))};
        return validateVerification(persisted,reference.geometryHash,reference.regions);
    }
    const copy = {...raw, method:VERIFIED_CENTRALIZED_VERSION, coverageConfirmed:false, confirmedFloors:[],
        regions:raw.regions.map(r=>{
            const current=reference.regions.find(x=>x.id===r.id);
            return {...r,...current,sampleIds:r.sampleIds,boundaryCells:r.boundaryCells,floorFeet:r.floorFeet??current?.floorFeet,role:current?.area===0?'excluded':(['excluded','transition','occupied','gathering'].includes(r.role)?r.role:current?.role??'unknown'),openSky:r.openSky,note:r.note};
        })};
    return validateVerification(copy,reference.geometryHash,reference.regions);
}
