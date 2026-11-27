import type { SiteLayerKind } from "./types";

export function classifyLayerName(name: string): SiteLayerKind {
  const n = name.toLowerCase();
  if (n.includes("water")) return "waterfront";
  if (n.includes("road") || n.includes("sidewalk") || n.includes("asphalt")) return "roads";
  if (n.includes("adjacent") || n.includes("building")) return "buildings";
  if (n.includes("retain") || n.includes("infra") || n.includes("utility")) return "infrastructure";
  if (n.includes("terrain") || n.includes("ground") || n.includes("topo")) return "terrain";
  if (n.includes("landscape") || n.includes("tree") || n.includes("veg")) return "landscape";
  if (n.includes("property") || n.includes("parcel") || n.includes("boundary") || n === "site") return "suggested-development";
  return "context";
}

export function classifyMaterialName(name: string): SiteLayerKind | null {
  const n = name.toLowerCase();
  if (n.includes("gold")) return "suggested-development";
  if (n.includes("water")) return "waterfront";
  if (n.includes("asphalt")) return "roads";
  if (n.includes("plaster") || n.includes("white")) return "buildings";
  return null;
}

export const LAYER_COLORS: Record<SiteLayerKind, string> = {
  terrain: "#6b5a3c",
  buildings: "#7E838A",
  roads: "#b9bec6",
  property: "#d6ad4f",
  waterfront: "#1288b8",
  landscape: "#4f7a4a",
  infrastructure: "#8a8178",
  "suggested-development": "#d6ad4f",
  context: "#9a9a9a",
};
