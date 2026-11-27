import baseline from '../../proof/fixtures/room-full-profile-current.json';
import suspended from '../../proof/fixtures/room-suspended-llv.json';
import type {AmphitheaterRequest} from './amphitheaterInteractiveTypes';

export const fourLevelBaseline = baseline;
export function fourLevelStudy(order: 'original'|'shuffle'|'suspended'|'platforms', seed: number): AmphitheaterRequest {
  const request = structuredClone(order === 'platforms' || order === 'suspended' ? suspended : baseline) as AmphitheaterRequest;
  if (order === 'shuffle') {
    let state = seed;
    for (let level = 1; level < 4; level++) {
      const tier = request.source.filter(p => p.architecturalRole === 'perimeter' && p.levelIndex === level);
      for (let i = tier.length - 1; i > 0; i--) {
        state = (Math.imul(1664525, state) + 1013904223) >>> 0;
        const j = Math.floor(state / 4294967296 * (i + 1));
        [tier[i].letter, tier[j].letter] = [tier[j].letter, tier[i].letter];
      }
    }
  }
  if (order === 'platforms') request.roomWithinVolume = {...suspended.roomWithinVolume, version:'perimeter-room', edgePlatforms:true};
  request.sourceId = crypto.randomUUID();
  request.sourceName = order === 'platforms' ? 'Suspended room with L and U platforms' : order === 'suspended' ? suspended.sourceName : order === 'original' ? 'Full perimeter profiles · current order' : 'Full perimeter profiles · shuffle ' + seed;
  request.sourceSnapshot = {...baseline.sourceSnapshot, order, ...(order === 'shuffle' ? {seed} : {})};
  return request;
}
