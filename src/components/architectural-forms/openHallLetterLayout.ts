import type { Manifold } from 'manifold-3d/manifold';
import type { IntersectionPlacement } from '@/components/architectural-forms/architecturalConnections';
import type { arrangeOfficeLetters } from '@/components/architectural-forms/officeWorkspaceRules';
import { letterOverlapFractions } from '@/components/architectural-forms/letterOverlapRule';

type Initial = ReturnType<typeof arrangeOfficeLetters>;

/**
 * Open Hall letter→architecture: keep the role-seated poses from arrangeOfficeLetters
 * (column / floor / mezzanine / wall / roof on the current plan). Do not rewrite into
 * the legacy quadrant-pair layout — that left guide letters behind the form.
 */
export function arrangeOpenHallLs(source: IntersectionPlacement[], initial: Initial, makeSolid: (p: IntersectionPlacement) => Manifold) {
  const ids = source.map((p, i) => p.letter === 'L' ? i : -1).filter(i => i >= 0);
  if (!ids.length) throw new Error('Open Hall uses L letters only. Choose a selection containing at least one L.');
  const placements = ids.map((id) => {
    const seated = initial.placements[id] ?? source[id];
    return {
      ...seated,
      letter: 'L' as const,
      letterRules: seated.letterRules
        ? { ...seated.letterRules, architectural: true }
        : {
            yaw: seated.rz, level: 0, supportZ: seated.z, strokeWidth: seated.scale * 0.14,
            footTilt: 0, armRoll: 0, deviations: [], architectural: true, mirrored: false, enclosed: false,
          },
    };
  });
  const solids = placements.map(makeSolid);
  const officePlan = initial.officePlan!;
  officePlan.letterSources = ids;
  const roles = placements.map((p) => p.openHallRole ?? 'guide');
  const roleCounts = [...new Set(roles)].map((role) => `${roles.filter((r) => r === role).length} ${role}`).join(', ');
  return {
    ...initial,
    placements,
    sequence: placements.map((_, i) => i),
    officePlan,
    supported: true,
    overlapFractions: letterOverlapFractions(solids),
    riseFractions: [] as number[],
    operations: [
      `Open Hall seats ${placements.length} L guides on the current plan slots (${roleCounts}).`,
      'Guide poses track plates and letter fills: floor/mezz corners, column grid, wall and roof guides.',
      `${source.length - ids.length} U/V letters are excluded.`,
    ],
  };
}
