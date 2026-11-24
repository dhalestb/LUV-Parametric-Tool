import { OPEN_VOLUME_ALGORITHM_VERSION } from "./descriptorVersion";

export const DESCRIPTOR_RANK_STORAGE_KEY = "vul-descriptor-ranks";

export type DescriptorRankSnapshot = {
  version: string;
  /** Present only when Open Volume was scored by this exact algorithm. */
  openVolumeVersion?: string;
  centralizedVersion?: string;
  forms: Array<{
    slotId: string;
    meshId: string;
    filename: string;
    /** absoluteScore is null when the descriptor was unavailable for that form (v4). */
    descriptors: Record<string, { absoluteScore: number | null; comparativeRank?: number }>;
  }>;
};

export type RankComponent = {
  name: string;
  raw?: number;
  weight: number;
};

export type RankDescriptor = {
  id: string;
  version?: string;
  absoluteScore: number;
  components: RankComponent[];
  comparativeRank?: number;
  relativeRank?: number;
  relativePercentile?: number;
  cohortSize?: number;
  tieBreakUsed?: boolean;
};

/**
 * Unique comparative ranks. The highest rank is the strongest expression in the current set.
 * Order: full-precision absolute score, then raw components by descending weight,
 * then stable form id. The absolute score is never changed to break a tie.
 * A measured 0 is ranked. Forms whose score is not finite (processing failure)
 * receive no rank and do not count toward the cohort for that descriptor.
 */
export function assignComparativeRanks<T extends { formId: string; descriptors: RankDescriptor[] }>(forms: T[]) {
  if (!forms.length) return forms;
  const centralVersions = new Set(forms.flatMap(f=>f.descriptors.filter(d=>d.id==='centralized').map(d=>d.version??'legacy')));
  if(centralVersions.size>1)for(const version of centralVersions){
    assignComparativeRanks(forms.flatMap(f=>{
      const descriptors=f.descriptors.filter(d=>d.id==='centralized'&&(d.version??'legacy')===version);
      return descriptors.length?[{formId:f.formId,descriptors}]:[];
    }));
  }
  const ids = forms[0].descriptors.map((descriptor) => descriptor.id).filter(id=>id!=='centralized'||centralVersions.size<=1);
  for (const id of ids) {
    const rows = forms.flatMap((form, index) => {
      const descriptor = form.descriptors.find((item) => item.id === id);
      if (!descriptor) return [];
      if (!Number.isFinite(descriptor.absoluteScore)) {
        descriptor.comparativeRank = undefined;
        descriptor.relativeRank = undefined;
        descriptor.relativePercentile = undefined;
        descriptor.cohortSize = undefined;
        descriptor.tieBreakUsed = undefined;
        return [];
      }
      const components = [...descriptor.components]
        .filter((component) => component.weight > 0)
        .sort((left, right) => right.weight - left.weight || left.name.localeCompare(right.name));
      return [{
        index,
        formId: form.formId,
        absolute: descriptor.absoluteScore,
        components,
      }];
    });
    const count = rows.length;
    rows.sort((left, right) => {
      if (left.absolute !== right.absolute) return left.absolute - right.absolute;
      const limit = Math.max(left.components.length, right.components.length);
      for (let index = 0; index < limit; index += 1) {
        const leftRaw = left.components[index]?.raw ?? 0;
        const rightRaw = right.components[index]?.raw ?? 0;
        if (leftRaw !== rightRaw) return leftRaw - rightRaw;
      }
      if (left.formId < right.formId) return -1;
      if (left.formId > right.formId) return 1;
      return left.index - right.index;
    });
    const sameMetrics = (left: (typeof rows)[number], right: (typeof rows)[number]) => {
      if (left.absolute !== right.absolute || left.components.length !== right.components.length) return false;
      return left.components.every((component, index) => (component.raw ?? 0) === (right.components[index]?.raw ?? 0));
    };
    rows.forEach((row, position) => {
      const descriptor = forms[row.index].descriptors.find((item) => item.id === id);
      if (!descriptor) return;
      const rank = position + 1;
      descriptor.comparativeRank = rank;
      descriptor.relativeRank = rank;
      descriptor.cohortSize = count;
      descriptor.relativePercentile = count === 1 ? 100 : Math.round(((rank - 1) / (count - 1)) * 100);
      descriptor.tieBreakUsed = rows.some((other) => other.index !== row.index && sameMetrics(other, row));
    });
  }
  return forms;
}

/** Drop Open Volume unless its stored version is exactly the current Open Volume algorithm. Other descriptors stay. */
export function rejectStaleOpenVolumeSnapshot(snapshot: DescriptorRankSnapshot): DescriptorRankSnapshot {
  if (snapshot.openVolumeVersion === OPEN_VOLUME_ALGORITHM_VERSION) return snapshot;
  return {
    version: snapshot.version,
    openVolumeVersion: snapshot.openVolumeVersion,
    forms: snapshot.forms.map((form) => {
      if (!Object.prototype.hasOwnProperty.call(form.descriptors, "openVolume")) return form;
      const descriptors = { ...form.descriptors };
      delete descriptors.openVolume;
      return { ...form, descriptors };
    }),
  };
}
