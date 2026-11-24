// Data contracts only: no architectural rules or defaults.
import type { Letter } from "@/components/architectural-forms/letterTypes";
export type Pt = [number, number];

export type OfficeCheck = { label: string; status: "pass" | "unverified"; detail: string };

export type OfficePlate = {
  id: string;
  polygon: Pt[];
  /** Finished upper surface, feet. */
  zTop: number;
  thickness: number;
  role: "ground" | "mezzanine" | "roof" | "working" | "terrace" | "support";
};

export type OfficeVoid = { id: string; polygon: Pt[]; cut: boolean };

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
