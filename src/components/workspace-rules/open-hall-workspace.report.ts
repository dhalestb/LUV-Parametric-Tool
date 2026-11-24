// Report criteria and defaults owned exclusively by open-hall-workspace.
type Binding = { title: string; labels: string[]; hard?: boolean };
export const reportRules: { letterBindings: Binding[]; architectureBindings: Binding[]; defaultField: {width:number;depth:number;height:number}; sourcePolicy: string; version: string } = {
letterBindings: [
    { title: "L-only vocabulary", labels: ["Letter variations"] },
    { title: "Orthogonal footprint 0/90/180/270", labels: ["Orthogonal footprint"] },
    { title: "Column L guides on equal XY grid", labels: ["Column L guides"] },
    { title: "Column size · grid 15/20/25 ft", labels: ["Column guide size"] },
    { title: "Floor and mezzanine L letters oriented", labels: ["Floor mezz L guides"] },
    { title: "Floor/mezz guide size 9/11/13 ft or custom", labels: ["Floor mezz guide size"] },
    { title: "Vertical wall L guides · independent size", labels: ["Wall L guides"] },
    { title: "Roof L guides 3/6/9 ft or custom", labels: ["Roof L guides"] },
    { title: "Letters invent form · inside field", labels: ["Letter-derived plates", "Letters inside field"] },
    { title: "No uniform rescale", labels: ["No uniform rescale"] },
  ],
architectureBindings: [
    { title: "Field containment", labels: ["Field envelope"] },
    { title: "Ground filled from floor L outer edges", labels: ["Ground plate filled"] },
    { title: "Central hall · mezz opening over centre", labels: ["Central hall"] },
    { title: "Mezz from pocket L inners · 25–40% · ≥10 ft", labels: ["Mezzanine opening", "Mezzanine platform width"] },
    { title: "Mezzanine mid-height", labels: ["Mezzanine elevation"] },
    { title: "Equal XY grid piers · floor-plate bound", labels: ["Column grid", "Supports and movement"] },
    { title: "Perimeter walls 1.5 ft · entry", labels: ["Perimeter walls and entry"] },
    { title: "Roof filled · skylights at roof L centers", labels: ["Roof plate filled", "Skylight bays"] },
    { title: "Occupied headroom >8 ft", labels: ["Headroom"] },
    { title: "Daylight / structure unverified", labels: [], hard: false },
  ],
defaultField: { width: 60, depth: 60, height: 20 },
sourcePolicy: "Open Hall invents its complete role-grouped L guides on Generate Design; regeneration preserves those sources.",
version: "1.2.0"
};
