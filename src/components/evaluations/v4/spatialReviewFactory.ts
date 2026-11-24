import { usableGatheringArea } from './usableGatheringArea';
import type { ManifoldToplevel } from 'manifold-3d';
let engine:Promise<ManifoldToplevel> | undefined;
import type { V4Context } from './evaluateV4';
import type { RegionConnection, RegionReconstruction } from './architecturalRegions';
import { VERIFICATION_VERSION, VERIFIED_CENTRALIZED_VERSION, type SpatialVerification } from './spatialVerification';
function proposedConnectionType(ctx: V4Context, edge: RegionConnection) {
    if (edge.type === 'opening')
        return 'doorway';
    const support = edge.sourceTriangleIds.flatMap(id => ctx.mesh.triangles[id] ? [Math.abs(ctx.mesh.triangles[id].normal[2])] : []);
    if (support.some(n => n > 0.85 && n < 0.999))
        return 'ramp';
    return edge.type === 'step' || edge.type === 'vertical-chain' ? 'stair' : 'passage';
}
/** Reproducible geometric proposals, never pre-confirmed architectural labels. */
export async function createSpatialReview(ctx: V4Context, reconstruction: RegionReconstruction, source: {
    hash: string;
    id: string;
    filename: string;
    unit: string;
    up: string;
}, suppliedEngine?:ManifoldToplevel): Promise<SpatialVerification> {
    // Seed architectural storeys from broad supported platforms. The detector also
    // emits elevations for trim and individual treads; users can split or group levels.
    const ordered = [...reconstruction.regions].sort((a,b)=>b.area-a.area || a.id-b.id);
    const anchors:number[] = [];
    for (const r of ordered) {
        if ((r.area >= 100 && !r.transitional || !anchors.length) && anchors.every(z=>Math.abs(z-r.centroid[2])>=7))
            anchors.push(Number(r.centroid[2].toFixed(2)));
    }
    function proposedFloor(z:number) {
        return anchors.reduce((best,a)=>Math.abs(a-z)<Math.abs(best-z)?a:best,anchors[0]??z);
    }
    if(!suppliedEngine) engine ??= import('./gatheringAreaEngine').then(m=>m.loadAreaEngine()).catch(error=>{engine=undefined;throw error;});
    const lib=suppliedEngine ?? await engine!;
    return {
        version: VERIFICATION_VERSION, method: VERIFIED_CENTRALIZED_VERSION,
        geometryHash: source.hash, sourceId: source.id, filename: source.filename, unit: source.unit, up: source.up,
        coverageConfirmed: false, updatedAt: new Date().toISOString(),
        regions: reconstruction.regions.map(r => {
            const samples = r.sampleIds.map(id => ctx.field.samples[id]);
            const heights = samples.flatMap(s => s.clearance === null ? [] : [s.clearance]);
            const usable=usableGatheringArea(lib,ctx.mesh.triangles,samples,ctx.field.sampleFeet);
            const adjoining = reconstruction.movementConnections.filter(c=>c.from===r.id || c.to===r.id);
            const steppedRoute = new Set(adjoining.filter(c=>c.type==='step' || c.type==='vertical-chain').map(c=>c.from===r.id?c.to:c.from)).size>=2;
            return { id: r.id, sampleIds: r.sampleIds, boundaryCells: samples.map(s => s.position), levelFeet: r.centroid[2], floorFeet: proposedFloor(r.centroid[2]),  area: usable.area, usableTotal:usable.total, usablePatch:usable.triangles,
                clearHeight: heights.length ? Math.min(...heights) : null, openSky: false, width: null, role: usable.area>0 ? 'candidate' : 'excluded',
                note: steppedRoute && usable.area>0 ? 'Several step transitions meet this floor. Review whether it is a through-route, a gathering destination, or both.' : usable.area>0 ? 'Continuous source-supported floor with seven feet of clear headroom. Review occupancy, gathering use or circulation-only function.' : 'No continuous footprint with seven feet of measured clear headroom.' };
        }),
        connections: reconstruction.movementConnections.map(c => ({
            from: c.from, to: c.to, state: 'unknown', type: proposedConnectionType(ctx, c),
            path: c.chainNodeIds.length ? c.chainNodeIds.map(id => ctx.network.nodes[id].position) : c.sampleNodePairs[0].map(id => ctx.network.nodes[id].position),
            note: `Proposal: ${c.type}; geometric confidence ${c.status}. Source triangles ${c.sourceTriangleIds.join(', ') || 'not established'}. ${c.reason} Architectural connection requires user confirmation.`,
        })),
    };
}
