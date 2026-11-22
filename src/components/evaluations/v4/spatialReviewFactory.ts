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
export function createSpatialReview(ctx: V4Context, reconstruction: RegionReconstruction, source: {
    hash: string;
    id: string;
    filename: string;
    unit: string;
    up: string;
}): SpatialVerification {
    return {
        version: VERIFICATION_VERSION, method: VERIFIED_CENTRALIZED_VERSION,
        geometryHash: source.hash, sourceId: source.id, filename: source.filename, unit: source.unit, up: source.up,
        coverageConfirmed: false, updatedAt: new Date().toISOString(),
        regions: reconstruction.regions.map(r => {
            const samples = r.sampleIds.map(id => ctx.field.samples[id]);
            const heights = samples.flatMap(s => s.clearance === null ? [] : [s.clearance]);
            const cells = new Set(samples.map(s => s.ix + ',' + s.iy));
            const radius = Math.ceil(5 / ctx.field.sampleFeet);
            const broad = r.area >= 100 && samples.some(s => {
                for (let dx = -radius; dx <= radius; dx++)
                    for (let dy = -radius; dy <= radius; dy++)
                        if (Math.hypot(dx, dy) * ctx.field.sampleFeet <= 5 && !cells.has((s.ix + dx) + ',' + (s.iy + dy)))
                            return false;
                return true;
            });
            const proposal = broad ? 'possible gathering floor (100 ft² and a supported 10 ft neighbourhood)' : r.transitional ? 'possible landing, transition or mesh fragment' : 'continuous supported floor';
            return { id: r.id, sampleIds: r.sampleIds, boundaryCells: samples.map(s => s.position), levelFeet: r.centroid[2], area: r.area,
                clearHeight: heights.length ? Math.min(...heights) : null, openSky: false, width: null, role: 'unknown',
                note: `Proposal: ${proposal}. Inferred boundary; use and unobstructed width unverified. ${samples.every(s => s.clearance === null) ? 'No overhead hit; confirm open sky versus missing OBJ geometry.' : 'Height is the minimum sampled overhead clearance, not a room-wide certified dimension.'}` };
        }),
        connections: reconstruction.movementConnections.map(c => ({
            from: c.from, to: c.to, state: 'unknown', type: proposedConnectionType(ctx, c),
            path: c.chainNodeIds.length ? c.chainNodeIds.map(id => ctx.network.nodes[id].position) : c.sampleNodePairs[0].map(id => ctx.network.nodes[id].position),
            note: `Proposal: ${c.type}; geometric confidence ${c.status}. Source triangles ${c.sourceTriangleIds.join(', ') || 'not established'}. ${c.reason} Architectural connection requires user confirmation.`,
        })),
    };
}
