import type { AmphitheaterSource } from './amphitheaterInteractiveTypes';
import type { LobbyLink, LobbyTypologyId } from './lobbyProof';

export type LobbyStudy = {
  id: string;
  created: string;
  typologyId: LobbyTypologyId;
  name: string;
  field: { width: number; depth: number; height: number };
  preferredFeet: number;
  population: number;
  sourceCount: number;
  source: AmphitheaterSource[];
  links: LobbyLink[];
  architectureStudyId?: string;
};
