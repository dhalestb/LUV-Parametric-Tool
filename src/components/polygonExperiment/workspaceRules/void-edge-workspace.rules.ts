import type {VoidEdgeWallGuide} from '../flatDeepRules/contracts';

export const voidEdgeRules = {
  version: '2.21.0',
  joinShellByDefault: false,
  assembly: { volumeTolerance: 0.0001, relativeVolumeTolerance: 0.000001 },
  field: {
    defaults: { width: 40, depth: 40, height: 20 },
    sizes: [20, 40, 60],
    guideTolerance: 0.00001,
    solidTolerance: 0.0001,
  },
  guides: {
    letter: 'U',
    mainEnd: { defaultSize: 30, presets: [20, 25, 30] },
    mainSide: { defaultSize: 20, presets: [15, 20, 25] },
    coreEnd: { defaultSize: 10, presets: [10, 12, 15] },
    coreSide: { defaultSize: 8, presets: [8, 10, 12] },
    currentCount: 4,
    legacyCount: 2,
    untaggedLegacyTotals: [2, 6, 10, 14],
    rotationIncrement: 15,
    offsetRatio: 0.25,
    fieldClearance: 0.1,
    centerAboveDatum: 0.375,
    newGuideDepth: 0.748,
    floorCorrection: 0.000001,
  },
  stack: {
    spacing: 10,
    roofGuideClearance: 0.8,
    roofSetback: 0.05,
    intermediateRotations: { 20: 90, 40: 45, 60: 30 } as Readonly<Record<number, number>>,
    fallbackRotation: 30,
    firstCoreStory: 1,
    coreRepeat: 2,
    ellipseSamples: 256,
  },
  thickness: { slab: 0.75, slabLimit: 9, core: 1.5, outerWall: 1.5 },
  columns: { letter: 'L', defaultSize: 1, presets: [1, 2, 3], minimumSize: 0.1, guideDepth: 0.2, endGuideCount: 2, tipsPerGuide: 2, lowerRotation: 45, openingClearance: 0.001 },
  walls: {
    verticalGuide: { defaultSize: 2, presets: [2, 4, 6], defaultDirection: 'inward', displayDepth: 0.2 },
    pairings: [
      ['bottom', 'left'],
      ['top', 'right'],
      ['left', 'top'],
      ['right', 'bottom'],
    ],
    perimeterCoverage: 0.5,
    coverageTolerance: 0.00001,
    profileIntervals: 32,
    loftIntervals: 12,
    minimumContactArea: 0.0001,
    overlapTolerance: 0.00001,
  },
} as const;

export const voidEdgeBaseRotations = Array.from(
  {length:360/voidEdgeRules.guides.rotationIncrement},(_,i)=>i*voidEdgeRules.guides.rotationIncrement,
);

export function voidEdgeAutoRotation(fitting:readonly number[],seed:number) {
  const count=voidEdgeBaseRotations.length;
  const start=((seed%count)+count)%count;
  return [...voidEdgeBaseRotations.slice(start),...voidEdgeBaseRotations.slice(0,start)].find(angle=>fitting.includes(angle));
}

export function voidEdgeWallGuideSettings(settings?: VoidEdgeWallGuide):VoidEdgeWallGuide {
  const {defaultSize,defaultDirection}=voidEdgeRules.walls.verticalGuide;
  return {size:settings?.size??defaultSize,direction:settings?.direction??defaultDirection};
}

export function voidEdgeStoryLayout(height: number) {
  const { spacing, roofGuideClearance, firstCoreStory, coreRepeat } = voidEdgeRules.stack;
  const datums = [0];
  for (let datum = spacing; datum < height - roofGuideClearance; datum += spacing) datums.push(datum);
  return datums.map((datum, index) => ({
    datum,
    index,
    upperDatum: datums.at(index + 1) ?? 'roof' as const,
    kind: index >= firstCoreStory && (index - firstCoreStory) % coreRepeat === 0
      ? 'core' as const
      : 'outer-walls' as const,
  }));
}

type CoreSize = { topSize: number; sideSize: number };
type VoidEdgeGuide = {
  voidEdgeRole?: 'core' | 'wall' | 'column';
  voidEdgePlateDatum?: number | 'roof';
  scale: number;
};

export function voidEdgeMainGuideGroups<T extends VoidEdgeGuide>(source:readonly T[]) {
  const main=source.filter(guide=>!guide.voidEdgeRole);
  const tagged=main.some(guide=>guide.voidEdgePlateDatum!==undefined);
  const {untaggedLegacyTotals,legacyCount,currentCount}=voidEdgeRules.guides;
  const untaggedCount=untaggedLegacyTotals.some(count=>count===main.length)?legacyCount:currentCount;
  const ground=tagged?main.filter(guide=>guide.voidEdgePlateDatum===0):main.slice(0,untaggedCount);
  const roof=tagged?main.filter(guide=>guide.voidEdgePlateDatum==='roof'):
    main.length>ground.length?main.slice(-ground.length):[];
  return {main,tagged,ground,roof};
}

export function voidEdgeMainGuideSizes(source:readonly VoidEdgeGuide[]) {
  const {ground}=voidEdgeMainGuideGroups(source);
  return {
    topSize:ground[0]?.scale??voidEdgeRules.guides.mainEnd.defaultSize,
    sideSize:ground[2]?.scale??voidEdgeRules.guides.mainSide.defaultSize,
  };
}

export function voidEdgeColumnGuideSize(size?: number, source: readonly VoidEdgeGuide[] = []): number {
  return size ?? source.find(guide => guide.voidEdgeRole === 'column')?.scale ?? voidEdgeRules.columns.defaultSize;
}

export function voidEdgeCoreGuideSizes(settings?: CoreSize, source: readonly VoidEdgeGuide[] = []): CoreSize {
  const saved = source.filter(guide => guide.voidEdgeRole === 'core');
  return {
    topSize: settings?.topSize ?? saved[0]?.scale ?? voidEdgeRules.guides.coreEnd.defaultSize,
    sideSize: settings?.sideSize ?? saved[2]?.scale ?? voidEdgeRules.guides.coreSide.defaultSize,
  };
}

export function voidEdgeGuidesForCoreSizes<T extends VoidEdgeGuide>(source: T[], selected: CoreSize, previous: CoreSize): T[] {
  // Only an explicit shared size change replaces individually edited core guides.
  return selected.topSize === previous.topSize && selected.sideSize === previous.sideSize
    ? source
    : source.filter(guide => guide.voidEdgeRole !== 'core');
}
