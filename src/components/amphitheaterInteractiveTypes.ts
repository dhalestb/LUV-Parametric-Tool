import type { Letter } from "./letterTypes";
import type { DualRulesetReport, WorkspaceTypology } from "./workspaceDualRulesets";
import type { OfficeField, OfficePlan, OpenHallGuideRole } from "./workspace-rules/contracts";

export type IntersectionPlacement = {
  letter: Letter;
  x: number; y: number; z: number;
  rx: number; ry: number; rz: number;
  scale: number; scaleX: number; scaleY: number; scaleZ: number;
  rotationOrder?: "XYZ" | "ZYX";
  openHallRole?: OpenHallGuideRole;
  letterRules?: { yaw: number; level: number; supportZ: number; strokeWidth: number; footTilt: number;
    armRoll: number; deviations: string[]; architectural: boolean; mirrored?: boolean; enclosed?: boolean };
};

export type AmphitheaterRequest = {
  generator: "workspace-ten-rule";
  envelopeVersion: "workspace-ten-rule";
  workspaceTypology: WorkspaceTypology;
  typologyName?: string;
  field: Pick<OfficeField, "width" | "depth" | "height">;
  preferredFeet: number;
  openHall?: Pick<OfficeField, "mezzanineFaces" | "perimeterWalls" | "columnSize" | "columnGridSpacing" | "floorMezzGuideSize" | "wallGuideSize" | "roofGuideSize" | "roofSizing" | "roofInset" | "wallThickness" | "slabThickness"> & { joinWalls?: boolean };
  flatPlate?: NonNullable<OfficeField["flatPlate"]> & { showWalls?: boolean; joinWalls?: boolean };
  source: IntersectionPlacement[];
  sourceId: string;
  sourceName: string;
  sourceSnapshot?: unknown;
  population: number | "auto";
  workspacePlan?: OfficePlan;
  letterArrangementRulesetId?: string;
  letterArrangementRulesetVersion?: string;
  architecturalGenerationRulesetId?: string;
  architecturalGenerationRulesetVersion?: string;
  rulesetId?: string;
  rulesetVersion?: string;
  letterArrangementReport?: DualRulesetReport;
  architecturalGenerationReport?: DualRulesetReport;
};

export type ProofMesh = { positions: number[]; indices: number[] };
export type ProofObject = { id: string; mesh: ProofMesh; sources?: string[] };
export type AmphitheaterSummary = { id: string; created: string; request: AmphitheaterRequest; volume: number; sourceCount: number };
export type AmphitheaterResult = AmphitheaterSummary & {
  generator: "workspace-ten-rule";
  architecture: ProofMesh;
  perimeterWalls?: ProofMesh;
  letters: ProofObject[];
  components: ProofObject[];
  letterArrangementReport?: DualRulesetReport;
  architecturalGenerationReport?: DualRulesetReport;
  warnings: string[];
};
