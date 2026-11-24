import { buildAnalysisMesh, TriangleGrid } from "../evaluations/v4/geometry";
import { sampleFloors } from "../evaluations/v4/surfaces";
import { analyzeVoids } from "../evaluations/v4/voids";
import { buildCirculationNetwork, gatheringCenter, shortestPaths } from "../evaluations/v4/circulation";
import { LATTICE_SLOTS } from "../lattice/slots";
import { resolvedUp, UNIT_TO_FEET, type ImportedObj, type UnitName, type UpAxisMode } from "../lattice/types";

export type Family = "Lobby" | "Gathering" | "Hybrid";
export type Fit = { name: string; percent: number; evidence: string[] };

type Criterion = { label: string; value: number; min: number; max?: number };
export type HybridRule = Criterion & { sources: string[] };
export type HybridRuleset = { contributors: string[]; rules: HybridRule[] };
export type HybridAnalysis = { fits: Fit[]; ruleset: HybridRuleset };

function criterionFit({ value, min, max }: Criterion) {
  if (value < min) return value / min;
  if (max !== undefined && value > max) return max / value;
  return 1;
}

export function formatRuleTarget({ min, max }: Pick<Criterion, "min" | "max">) {
  return max === undefined ? "at least " + min : min === max ? String(min) : min + "–" + max;
}

function blendRules(matches: { name: string; checks: Criterion[]; weight: number }[]): HybridRuleset {
  const contributors = matches.filter(match => match.weight > 0);
  const rules = new Map<string, HybridRule>();
  for (const match of contributors) {
    for (const check of match.checks) {
      const previous = rules.get(check.label);
      if (previous) {
        previous.min = Math.max(previous.min, check.min);
        if (check.max !== undefined) previous.max = Math.min(previous.max ?? Infinity, check.max);
        previous.sources.push(match.name);
      } else {
        rules.set(check.label, { ...check, sources: [match.name] });
      }
    }
  }
  return {
    contributors: contributors.map(match => match.name),
    rules: [...rules.values()].sort((a, b) => b.sources.length - a.sources.length),
  };
}

export function analyzeHybrid(obj: ImportedObj, family: Family, unit: UnitName, axis: UpAxisMode): HybridAnalysis {
  if (!obj.positions.every(Number.isFinite)) throw Error("The OBJ contains invalid coordinates.");
  const mesh = buildAnalysisMesh({ ...obj, up: resolvedUp(obj.upAxis, axis), unitScale: UNIT_TO_FEET[unit] }, obj.id);
  if (!mesh.triangles.length) throw Error("The OBJ has no measurable surfaces.");
  const [x, y, rise] = mesh.bounds.size;
  if (Math.max(x,y,rise) > 500 || x*y > 40000) throw Error("Model exceeds the evaluation field. Check the import units.");
  const grid = new TriangleGrid(mesh);
  const field = sampleFloors(mesh, grid);
  const network = buildCirculationNetwork(field, grid);
  const voids = analyzeVoids(field, grid, mesh.bounds.planDiagonal);
  const main = network.nodes.filter(node => node.systemId === network.largestSystemId);
  const distances = shortestPaths(network, main.slice(0,1).map(node => node.id)).dist;
  const path = distances.reduce((best, d) => Number.isFinite(d) ? Math.max(best,d) : best, 0);
  const levels = field.levels.length;
  const ratio = Math.max(x,y) / Math.max(0.01, Math.min(x,y));
  const openArea = field.areaByClass.openVoid + field.deckArea;
  const opening = voids.dominant?.area ?? 0;
  const horizontal = mesh.triangles.reduce((a,t) => a + (Math.abs(t.normal[2]) >= .95 ? t.area : 0),0);
  const slopeRise = mesh.triangles.reduce((r,t) => {
    const nz = Math.abs(t.normal[2]);
    return nz > .1 && nz < .98 ? Math.max(r, Math.max(t.a[2],t.b[2],t.c[2])-Math.min(t.a[2],t.b[2],t.c[2])) : r;
  },0);
  // Changes of width along the largest connected floor approximate sequential thresholds.
  const widths = new Map<number,number>();
  const primaryLevel = field.levels.reduce((best,l) => !best || l.area > best.area ? l : best, field.levels[0]);
  for (const node of main) {
    if (node.levelId !== primaryLevel?.id) continue;
    const s = field.samples[node.sampleId];
    const bin = x >= y ? s.ix : s.iy;
    widths.set(bin,(widths.get(bin) ?? 0)+1);
  }
  const sections = [...widths.entries()].sort((a,b)=>a[0]-b[0]);
  const transitions = sections.filter(([bin,w],i) => i > 0 && bin === sections[i-1][0]+1 && Math.abs(w-sections[i-1][1])*field.sampleFeet >= 1).length;
  const links = network.levelLinks.filter(l=>l.status === "verified").length;
  const central = gatheringCenter(network,field)?.share ?? 0;
  const connection = main.length / Math.max(1,network.nodes.length);
  const edgeCount = field.branches.length;
  const enclosed = network.regions.filter(r=>r.floorClass === "sheltered").length;
  const check = (label: string, value: number, min: number): Criterion => ({ label, value, min });
  const level = (n:number) => check("Occupied levels",levels,n);
  const aspect = (n:number) => check("Plan length / width",ratio,n);
  const height = (n:number) => check("Vertical extent (ft)",rise,n);
  const perimeter = (n:number) => check("Projecting perimeter branches",edgeCount,n);
  const slope = check("Inclined surface rise (ft)",slopeRise,1);
  const sufficientOpen = check("Open area (ft²)",openArea,6);
  const plate = check("Horizontal surface (ft²)",horizontal,60);
  const lowLevels: Criterion = { ...level(1), max: 3 };
  const rules = {
    L1:[check("Interior opening (ft²)",opening,6),height(2),level(2)],
    L2:[check("Floor-width transitions",transitions,7)],
    L3:[aspect(1.5),check("Connected circulation share",connection,1),check("Walkable route (ft)",path,1)],
    L4:[slope,height(1)],
    L5:[aspect(1.8),check("Walkable route (ft)",path,4)],
    G1:[level(3),check("Gathering focus share",central,.5)],
    G2:[check("Interior voids",voids.interior.length,3),check("Connected level links",links,2)],
    G3:[perimeter(2),sufficientOpen],
    G4:[check("Sheltered floor regions",enclosed,1),check("Interior opening (ft²)",opening,1),sufficientOpen],
    G5:[aspect(1.8),perimeter(1)],
    O1:[plate,lowLevels],
    O2:[level(3),check("Connected circulation share",connection,.65)],
    O3:[plate,lowLevels],
    O4:[check("Interior voids",voids.interior.length,2),perimeter(2)],
    O5:[slope,height(1)]
  };
  const fits = LATTICE_SLOTS.filter(s=>family === "Hybrid" || s.category === family).map(slot=>{
    const checks = rules[slot.id as keyof typeof rules];
    return { name: slot.name, weight: checks.reduce((weight, criterion) => weight * criterionFit(criterion), 1), checks };
  }).sort((a,b)=>b.weight-a.weight);
  const total = fits.reduce((sum,f)=>sum+f.weight,0);
  // Round cumulative shares so ties remain within one percentage point and the sum is exactly 100.
  let cumulative = 0;
  const percentages = fits.map(f=>{
    const before = Math.round(cumulative);
    cumulative += total ? 100*f.weight/total : 0;
    return {name:f.name,percent:Math.round(cumulative)-before,evidence:f.checks.map(check => check.label + ": " + Number(check.value.toFixed(2)) + " (target " + formatRuleTarget(check) + ")")};
  });
  return { fits: percentages, ruleset: blendRules(fits) };
}
