// Report criteria and defaults owned exclusively by void-edge-workspace.
type Binding = { title: string; labels: string[]; hard?: boolean };
export const reportRules: { letterBindings: Binding[]; architectureBindings: Binding[]; defaultField: {width:number;depth:number;height:number}; sourcePolicy: string; version: string } = {
letterBindings: [
    { title: "Permitted U/L letters and placement", labels: ["Letter variations"] },
    { title: "Footprint ratio 1:1–5:4", labels: ["Footprint ratio"] },
    { title: "15° footprint orientation", labels: ["15° footprint rotation"] },
    { title: "Internal void 10–25% reserved", labels: ["Internal void"] },
    { title: "Working band depth and loop", labels: ["Working depth", "Circulation loop"] },
    { title: "No silent rescale of letters", labels: ["No uniform rescale"] },
  ],
architectureBindings: [
    { title: "Field containment", labels: ["Field envelope"] },
    { title: "Level band and vertical void", labels: ["Level band and vertical void"] },
    { title: "Clear headroom >10 ft", labels: ["Clear height"] },
  ],
defaultField: { width: 40, depth: 40, height: 20 },
sourcePolicy: "Source identities, quantities and proportions are retained; poses may be rearranged, slots reused and letters inset to the selected field.",
version: "1.2.0"
};
