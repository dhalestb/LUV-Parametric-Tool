import { analyzeHybrid, type Family, type Fit, type HybridAnalysis, type HybridRuleset } from "./analyzeHybrid";
import { parseObj } from "../lattice/parseObj";
import { resolvedUp, type ImportedObj, type UnitName, type UpAxis, type UpAxisMode } from "../lattice/types";

export type StoredForm = { mesh: ImportedObj; fits: Fit[] | null; ruleset?: HybridRuleset; unit: UnitName; up: UpAxis };
export type HybridRequest =
  | { action: "store"; file: File; unit: UnitName; axis: UpAxisMode }
  | { action: "analyze"; form: StoredForm; family: Family };
export type HybridReply = { stored: StoredForm } | HybridAnalysis | { error: string };

self.onmessage = async ({ data }: MessageEvent<HybridRequest>) => {
  try {
    let reply: HybridReply;
    if (data.action === "store") {
      const mesh = parseObj(await data.file.text(), data.file.name);
      if (!mesh.positions.every(Number.isFinite)) throw Error("The OBJ contains invalid coordinates.");
      reply = { stored: { mesh, fits: null, unit: data.unit, up: resolvedUp(mesh.upAxis, data.axis) } };
    } else {
      const { mesh, unit, up } = data.form;
      reply = analyzeHybrid(mesh, data.family, unit, up);
    }
    self.postMessage(reply);
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "Could not process this OBJ." });
  }
};
