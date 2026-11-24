// Report criteria and defaults owned exclusively by flat-deep-plan-plate.
type Binding = { title: string; labels: string[]; hard?: boolean };
export const reportRules: { letterBindings: Binding[]; architectureBindings: Binding[]; defaultField: {width:number;depth:number;height:number}; sourcePolicy: string; version: string } = {
letterBindings: [
    { title: "Permitted letters and placement", labels: ["Letter variations"] },
    { title: "Plate ratio 3:2–5:2", labels: ["Working plate ratio"] },
    { title: "15° footprint orientation", labels: ["15° footprint rotation"] },
    { title: "Longitudinal strip ≥5 ft reserved", labels: ["Longitudinal strip"] },
    { title: "Single working elevation intent", labels: ["Single working level"] },
    { title: "No silent rescale of letters", labels: ["No uniform rescale"] },
  ],
architectureBindings: [
    { title: "Field containment", labels: ["Field envelope"] },
    { title: "Open long edges / daylight", labels: ["Daylight edges"] },
    { title: "One-level working tile", labels: ["One-level tile"] },
    { title: "Clear headroom >10 ft", labels: ["Clear height"] },
  ],
defaultField: { width: 20, depth: 60, height: 20 },
sourcePolicy: "Source identities, quantities and proportions are retained; poses may be rearranged, slots reused and letters inset to the selected field.",
version: "1.2.0"
};
