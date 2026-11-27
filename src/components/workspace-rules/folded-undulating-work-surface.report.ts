// Report criteria and defaults owned exclusively by folded-undulating-work-surface.
type Binding = { title: string; labels: string[]; hard?: boolean };
export const reportRules: { letterBindings: Binding[]; architectureBindings: Binding[]; defaultField: {width:number;depth:number;height:number}; sourcePolicy: string; version: string } = {
letterBindings: [
    { title: "Permitted letters and placement", labels: ["Letter variations"] },
    { title: "Square main plate on 10 ft grid", labels: ["Square main plate", "10 ft plan grid"] },
    { title: "Breaks ≤40% with connected main", labels: ["Break area limit", "Main plate connected"] },
    { title: "Distributed plates and voids", labels: ["Distributed plates"] },
    { title: "15° footprint orientation", labels: ["15° footprint rotation"] },
    { title: "No silent rescale of letters", labels: ["No uniform rescale"] },
  ],
architectureBindings: [
    { title: "Field containment", labels: ["Field envelope"] },
    { title: "Rise and fall elevations", labels: ["Rise and fall"] },
    { title: "Ramp slope ≤1:12", labels: ["Ramp slope"] },
    { title: "Three 5×5 working areas", labels: ["Three working areas"] },
    { title: "Clear headroom >10 ft", labels: ["Clear height"] },
  ],
defaultField: { width: 60, depth: 60, height: 20 },
sourcePolicy: "Source identities, quantities and proportions are retained; poses may be rearranged, slots reused and letters inset to the selected field.",
version: "1.2.0"
};
