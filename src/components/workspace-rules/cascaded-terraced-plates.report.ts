// Report criteria and defaults owned exclusively by cascaded-terraced-plates.
type Binding = { title: string; labels: string[]; hard?: boolean };
export const reportRules: { letterBindings: Binding[]; architectureBindings: Binding[]; defaultField: {width:number;depth:number;height:number}; sourcePolicy: string; version: string } = {
letterBindings: [
    { title: "Permitted letters and placement", labels: ["Letter variations"] },
    { title: "10 ft grid breaks ≤40%", labels: ["10 ft plan grid", "Break area limit"] },
    { title: "Connected main plate", labels: ["Main plate connected"] },
    { title: "Directional elevation sequences", labels: ["Elevation sequences"] },
    { title: "10×10 usable reserves", labels: ["10×10 usable areas"] },
    { title: "15° footprint orientation", labels: ["15° footprint rotation"] },
    { title: "No silent rescale of letters", labels: ["No uniform rescale"] },
  ],
architectureBindings: [
    { title: "Field containment", labels: ["Field envelope"] },
    { title: "Elevation sequences preserved", labels: ["Elevation sequences"] },
    { title: "Plate connections", labels: ["Plate connections"] },
    { title: "10×10 usable areas", labels: ["10×10 usable areas"] },
    { title: "Terrace headroom >10 ft", labels: ["Terrace headroom"] },
  ],
defaultField: { width: 60, depth: 40, height: 20 },
sourcePolicy: "Source identities, quantities and proportions are retained; poses may be rearranged, slots reused and letters inset to the selected field.",
version: "1.2.0"
};
