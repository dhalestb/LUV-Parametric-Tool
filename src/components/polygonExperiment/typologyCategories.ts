import type {Typology} from './model';

export const spaceCategories = ['Gathering Spaces', 'Lobby Spaces', 'Workspaces', 'Hybrid Spaces'] as const;
export type SpaceCategory = typeof spaceCategories[number];

export const categoryByTypology: Record<Typology, SpaceCategory> = {
  'linear-edge-gallery': 'Gathering Spaces',
  'inserted-plate': 'Gathering Spaces',
  'vertical-walls': 'Gathering Spaces',
  'room-within-volume': 'Gathering Spaces',
  'void-field': 'Gathering Spaces',
  'open-hall-workspace':'Workspaces',
  'void-edge-workspace':'Workspaces',
  'flat-deep-plan-plate': 'Workspaces',
  'linear-gallery-lobby': 'Lobby Spaces',
  'topographic-ground-field-lobby': 'Lobby Spaces',
  'compressed-sequential-lobby': 'Lobby Spaces',
  'vertical-void-lobby': 'Lobby Spaces',
};
