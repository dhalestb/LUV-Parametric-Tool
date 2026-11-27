import type {Letter} from "../../letterTypes";
export type IntersectionPlacement = {
  voidEdgeRole?: 'core' | 'wall' | 'column';
  voidEdgeWallId?: string;
  voidEdgeRotation?: number;
  voidEdgePlateDatum?: number | 'roof';
  letterRules?: {architectural?:boolean;supportZ?:number;yaw?:number;level?:number;strokeWidth?:number;footTilt?:number;armRoll?:number;deviations?:unknown[];mirrored?:boolean;enclosed?:boolean};
  letter: Letter;
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  scale: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  /** Open Hall L-guide role when letters drive generation. */
  rotationOrder?: "XYZ" | "ZYX";
  openHallRole?: "column" | "floor" | "mezzanine" | "wall" | "roof";
};
