import { LATTICE_FEET } from "../lattice/types";
import type { ImportedObj } from "../lattice/types";
import { bayFootprint, corridorObstructs, distanceToPolyline, footprintPermitted, polygonCentroid, type Point } from "./geometry";
import { evaluateSourceFidelity } from "./protoFormSource";
import type { SiteSurfaceSampler } from "./siteSurface";
import type { ClusterZone, EvaluationFinding, GenerationAlternative, SiteConstraints, ViewCorridor } from "./types";

export function evaluateAlternative(alternative: GenerationAlternative, context: {
  zones: ClusterZone[];
  exclusions: ClusterZone[];
  water: Point[];
  roads: Point[];
  corridors: ViewCorridor[];
  constraints: SiteConstraints;
  notes: string[];
  surfaceSampler?: SiteSurfaceSampler | null;
  /**
   * Meshes available to the Site viewport.
   * Pass an array (possibly empty) to evaluate source fidelity.
   * Omit the field during interim generator calls so placement hard-checks run first.
   */
  meshes?: ImportedObj[] | null;
}): GenerationAlternative {
  const findings: EvaluationFinding[] = [];
  const exclusions = context.exclusions.map((zone) => zone.polygon);
  const zoneById = new Map(context.zones.map((zone) => [zone.id, zone]));

  alternative.clusters.forEach((cluster, index) => {
    const zone = zoneById.get(cluster.zoneId);
    const footprint = bayFootprint(cluster.x, cluster.z, cluster.bayFeet, cluster.yawDeg);
    const permitted = footprintPermitted(footprint, zone ? [zone.polygon] : [], exclusions);
    findings.push({
      id: `boundary-${index}`,
      category: "boundary",
      kind: "hard",
      passed: permitted.ok,
      score: permitted.ok ? 1 : 0,
      reason: `${cluster.id}: ${permitted.reason}`,
    });
    const surface = context.surfaceSampler?.sample(cluster.x, cluster.z);
    const foundation = surface?.ok ? surface.y : (context.surfaceSampler?.datumY ?? 0);
    const offset = zone?.elevationOffsetFeet ?? 0;
    const relativeLift = cluster.elevation - foundation;
    // Height limit applies to building envelope above foundation, not absolute world Y.
    if (relativeLift - offset + LATTICE_FEET > (zone?.maxHeightFeet ?? context.constraints.heightLimitFeet) + 1e-6) {
      findings.push({
        id: `height-${index}`,
        category: "height",
        kind: "hard",
        passed: false,
        score: 0,
        reason: `${cluster.id}: building envelope ${(relativeLift - offset + LATTICE_FEET).toFixed(1)} ft above foundation exceeds the zone height limit.`,
      });
    }
    if (context.surfaceSampler && Math.abs(relativeLift - offset) > 1.5) {
      findings.push({
        id: `foundation-${index}`,
        category: "foundation",
        kind: "hard",
        passed: false,
        score: 0,
        reason: `${cluster.id}: foundation is ${relativeLift.toFixed(1)} ft above Site surface (offset ${offset.toFixed(1)} ft). Expected alignment within 1.5 ft.`,
      });
    } else if (context.surfaceSampler && !surface?.ok) {
      findings.push({
        id: `foundation-uncertain-${index}`,
        category: "foundation",
        kind: "preference",
        passed: false,
        score: 0.35,
        reason: `${cluster.id}: ${surface?.reason ?? "Site-surface sample uncertain."}`,
      });
    }
    context.corridors.forEach((corridor) => {
      const hit = corridorObstructs(footprint, corridor.points, corridor.widthFeet);
      findings.push({
        id: `view-${index}-${corridor.id}`,
        category: "view",
        kind: "preference",
        passed: !hit,
        score: hit ? 0 : 1,
        reason: hit
          ? `${cluster.id} intersects view corridor ${corridor.name} (geometric proxy, not a surveyed sightline).`
          : `${cluster.id} clears view corridor ${corridor.name}.`,
      });
    });
  });

  const waterCenters = alternative.clusters.map((cluster) => {
    const inland = context.water.length ? distanceToPolyline([cluster.x, cluster.z], context.water) : 80;
    return { cluster, inland };
  });
  if (waterCenters.length >= 2) {
    const near = [...waterCenters].sort((a, b) => a.inland - b.inland)[0];
    const far = [...waterCenters].sort((a, b) => b.inland - a.inland)[0];
    const gradientOk = near.cluster.elevation <= far.cluster.elevation + 4;
    findings.push({
      id: "gradient",
      category: "height-gradient",
      kind: "preference",
      passed: gradientOk,
      score: gradientOk ? 1 : 0.35,
      reason: gradientOk
        ? "Lower cluster sits closer to the waterfront than the taller inland cluster (geometric proxy)."
        : "Waterfront-adjacent cluster is not lower than the inland cluster. User exceptions remain allowed.",
    });
  }

  if (context.roads.length && alternative.clusters.length) {
    const nearestRoad = [...alternative.clusters].sort((a, b) => distanceToPolyline([a.x, a.z], context.roads) - distanceToPolyline([b.x, b.z], context.roads))[0];
    findings.push({
      id: "noise",
      category: "acoustic-buffer",
      kind: "preference",
      passed: true,
      score: Math.min(1, nearestRoad.elevation / 24),
      reason: `Nearest-road cluster elevation ${nearestRoad.elevation.toFixed(1)} ft is a massing proxy only. No decibel reduction is claimed.`,
    });
  }

  const disconnected = alternative.clusters.filter((cluster) => {
    if (alternative.clusters.length <= 1) return false;
    return !alternative.clusters.some((other) => other.id !== cluster.id && Math.hypot(other.x - cluster.x, other.z - cluster.z) < 80);
  });
  findings.push({
    id: "circulation",
    category: "circulation",
    kind: "preference",
    passed: disconnected.length === 0,
    score: disconnected.length ? 0.4 : 1,
    reason: disconnected.length
      ? `${disconnected.length} clusters are more than 80 ft from any neighbor. Pedestrian links are not generated as architecture.`
      : "Every cluster is within 80 ft of another cluster (spacing proxy, not an accessible route).",
  });

  context.notes.forEach((note, index) => {
    findings.push({
      id: `note-${index}`,
      category: "generation",
      kind: "preference",
      passed: !note.includes("failed") && !note.includes("no Lattice"),
      score: 0.5,
      reason: note,
    });
  });

  if (!alternative.clusters.length) {
    findings.push({
      id: "empty",
      category: "feasibility",
      kind: "hard",
      passed: false,
      score: 0,
      reason: "No proto forms were placed. Check zone area, exclusions, Lattice sources, and footprint containment.",
    });
  }

  const collisionTotal = (alternative.zoneStats ?? []).reduce((sum, item) => sum + (item.destructiveCollisions ?? 0), 0);
  const boundaryTotal = (alternative.zoneStats ?? []).reduce((sum, item) => sum + (item.boundaryViolations ?? 0), 0);
  if (collisionTotal > 0) {
    findings.push({
      id: "destructive-collisions",
      category: "collision",
      kind: "hard",
      passed: false,
      score: 0,
      reason: `${collisionTotal} destructive plan overlap(s) between independent forms. Zero edge clearance allows touch, not overlap.`,
    });
  }
  if (boundaryTotal > 0) {
    findings.push({
      id: "boundary-failures",
      category: "boundary",
      kind: "hard",
      passed: false,
      score: 0,
      reason: `${boundaryTotal} form footprint(s) violate zone boundary or exclusions.`,
    });
  }
  const assemblyFails = (alternative.assemblyReport?.feasibilityFailures ?? []).filter((item) => (
    item.category === "collision" || item.category === "site-boundary" || item.category === "height"
  ));
  if (assemblyFails.length) {
    findings.push({
      id: "assembly-hard",
      category: "assembly",
      kind: "hard",
      passed: false,
      score: 0,
      reason: `Lattice assembly reported ${assemblyFails.length} hard geometric failure(s). Site placement and assembly validity are separate.`,
    });
  }

  const runFidelity = context.meshes !== undefined && context.meshes !== null;
  const sourceFidelity = runFidelity
    ? evaluateSourceFidelity({
      clusters: alternative.clusters,
      meshes: context.meshes ?? [],
      protoFormSource: alternative.protoFormSource,
    })
    : (alternative.sourceFidelity ?? null);
  const sourceFidelityPassed = runFidelity
    ? !!sourceFidelity?.passed
    : (alternative.sourceFidelityPassed !== false);
  if (runFidelity && sourceFidelity && !sourceFidelity.passed) {
    findings.push({
      id: "source-fidelity",
      category: "source-fidelity",
      kind: "hard",
      passed: false,
      score: 0,
      reason: sourceFidelity.note,
    });
  } else if (runFidelity && sourceFidelity && alternative.clusters.length) {
    findings.push({
      id: "source-fidelity",
      category: "source-fidelity",
      kind: "preference",
      passed: true,
      score: 1,
      reason: sourceFidelity.note,
    });
  }

  // Placement hard-pass excludes source-fidelity so the two statuses remain independent.
  const placementHard = findings.filter((item) => item.kind === "hard" && item.category !== "source-fidelity");
  const prefs = findings.filter((item) => item.kind === "preference");
  const hardPassed = placementHard.every((item) => item.passed);
  return {
    ...alternative,
    findings,
    hardPassed,
    sourceFidelityPassed,
    sourceFidelity,
    preferenceScore: prefs.length ? prefs.reduce((sum, item) => sum + item.score, 0) / prefs.length : 0,
  };
}

export function programNote(constraints: SiteConstraints) {
  return `Program inputs are design priorities, not verified occupancy: ${constraints.daytimeOccupants} daytime workplace occupants, ${constraints.eveningGathering} evening gathering participants, ${constraints.badgeHolders} badge holders/visitors. Capacity is not claimed without usable-area analysis.`;
}

export function zoneCenter(zone: ClusterZone): Point {
  return polygonCentroid(zone.polygon);
}
