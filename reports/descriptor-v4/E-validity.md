# E. Architectural validity classification

Classes:

- **Verified Geometric Measurement** — the stated condition is reliably measurable from the imported mesh.
- **Architectural Proxy** — the calculation measures a related characteristic but does not fully establish the architectural interpretation.
- **Potential Spatial Relationship** — the condition is geometrically suggested but not fully verified.
- **Insufficient Evidence** — reserved for a geometry-processing failure (empty mesh). A missing architectural characteristic is a measured 0, not this class.

| Descriptor | Class | Why |
|---|---|---|
| Open Volume | Verified Geometric Measurement | Clearance, enclosure, and floor class are measured on original surfaces. Roof exposure is excluded rather than inferred as interior. Uncertain enclosure is reported, not credited. Occupiable gathering is still an interpretation of that volume. |
| Convergent | Verified Geometric Measurement | Routes and destination are measured on a supported floor network. “Entry” is a geometric opening, not a programmed door. Fewer than two approaches scores a limited or zero result and is still ranked. Upper-level openings are potential interfaces, not verified approaches. |
| Sculptural | Verified Geometric Measurement | Folds, orientation entropy, sectional CV, and mirror mismatch are mesh measurements, area-weighted. They measure formal articulation, not aesthetic quality. |
| Visually Connected | Verified Geometric Measurement | Same-level eye-height rays against the original mesh. No glazing is inferred. Coverage is of the sampled set, not every possible standing point. |
| Surreal | Architectural Proxy | Non-axis area, mass shift, unsupported floor, and clearance contrast are measurable. None of them prove surreal intent. The score is a geometric unusualness index. |
| Monumental | Verified Geometric Measurement of size; Architectural Proxy of monumentality | Height, clear volume, and level area are measured in feet with fixed thresholds. Monumentality also depends on site, human scale, and context that the OBJ does not contain. |
| Hierarchical | Verified Geometric Measurement of planes | Primary/secondary/tertiary are largest detected floors or, on a single architectural level, occupiable regions. A missing secondary plane scores 0; the form is still ranked. |
| Sequential | Verified Geometric Measurement of the route; Potential Spatial Relationship for unverified vertical moves | The numbered path is a verified floor-network walk. Dashed links are candidates. A missing stair is not drawn. No entry on the lowest level starts from the largest region; an absent sequence scores 0 and is ranked. |
| Circulation Activated | Verified Geometric Measurement of the network; Architectural Proxy of “activation” | Continuity, junctions, and interfaces are geometric. They are not programmed activity. |
| Centralized | Architectural Proxy | Mass and occupiable centroids are measured. They are not a central public space. |
| Vertically Integrated | Verified Geometric Measurement of the four components | Void, view, circulation, and level set are separate. Circulation is verified / potential / disconnected. A form with one level scores 0 for vertical integration and is still ranked. Upper levels without stairs still exist. |
| Luminous | Potential Spatial Relationship | Overhead and lateral escaped rays are geometric exposure. Without sky, sun, material, and glazing, the result is labelled Potential Natural-Light Penetration. A sealed interior that is tested and fully blocked is a measured zero. An exterior-only slab also scores 0 (no interior probe) and is ranked. |

Per-form `evidence.validity` follows the same table. `finish()` sets `insufficient-evidence` only for a processing failure (empty mesh). A measured 0 keeps the descriptor's validity class.

Do not claim that any of these twelve qualities is conclusively determined from OBJ geometry alone.
