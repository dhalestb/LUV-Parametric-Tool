// Data contracts only: no architectural rules or defaults.
import type { Letter } from "../letterTypes";
export type Pt = [number, number];

export type MezzanineWrapFaces = 2 | 3 | 4;

export type OpenHallCorner = "SW" | "SE" | "NE" | "NW";

export type OpenHallGuideRole = "column" | "floor" | "mezzanine" | "wall" | "roof";

export type OpenHallGuideCandidate = {
  p: Pt;
  z: number;
  scale: number;
  role: OpenHallGuideRole;
  rx: number;
  ry: number;
  rz: number;
};

export type OfficeField = {
  flatPlate?: { columnSpacing?: number; wallThickness?: number; slabThickness?: number; columnSize?: number; floorMezzGuideSize?: number; wallGuideSize?: number };
  width: number;
  depth: number;
  height: number;
  mezzanineFaces?: MezzanineWrapFaces;
  preferredFeet?: number;
  /** Open Hall: retained for request preference; walls are always generated for viewer toggle. */
  perimeterWalls?: boolean;
  wallThickness?: number;
  slabThickness?: number;
  columnSize?: number;
  /** Open Hall: equal XY column grid module (ft); presets 15 / 20 / 25. */
  columnGridSpacing?: number;
  floorMezzGuideSize?: number;
  wallGuideSize?: number;
  roofGuideSize?: number;
  roofSizing?: "fixed" | "pillar";
  roofInset?: number;
};

export type OfficeCheck = { label: string; status: "pass" | "fail" | "unverified"; detail: string };

export type OfficePlate = {
  id: string;
  polygon: Pt[];
  /** Finished upper surface, feet. */
  zTop: number;
  thickness: number;
  role: "ground" | "mezzanine" | "roof" | "working" | "terrace" | "support" | "wall";
};

export type OfficeVoid = {
  id: string;
  polygon: Pt[];
  cut: boolean;
  /** When set, only those plate roles are punched (skylights punch roof only). */
  roles?: OfficePlate["role"][];
};

export type OfficeLink = {
  id: string;
  from: Pt;
  to: Pt;
  z0: number;
  z1: number;
  width: number;
  thickness: number;
};

export type OfficeSlot = {
  x: number; y: number; z: number;
  rx: number; ry: number; rz: number;
  scale: number;
  prefer: Letter;
  /** Open Hall guide group for letter-driven generation. */
  openHallRole?: OpenHallGuideRole;
};

export type OfficePlan = {
  /** Original selection index for every generated instance, when filtered or repeated. */
  letterSources?: number[];
  typology: string;
  rotation: number;
  plates: OfficePlate[];
  voids: OfficeVoid[];
  links: OfficeLink[];
  checks: OfficeCheck[];
  slots: OfficeSlot[];
  operations: string[];
};
