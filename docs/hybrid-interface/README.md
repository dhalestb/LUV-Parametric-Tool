# Polygon-Driven Architecture interface review

The workspace now starts with Select Site, Choose Generation Method, Generate Design and Review Generated Architecture. Each method has five percentage inputs and a visible total. Generation requires 100% and a compatible site and rule configuration. Footprint coverage appears with the finished architecture.

## Before and after

Chrome captured each pair at 1440 × 940. The restored pairs use the same Miami checkpoint, Cluster Zone 1 and the archived 50% Plate / 50% Stepped study. Both controls screenshots below show the saved independent handoff still applied. The review pair uses Combined display and perspective.

| Section | Accepted milestone | Revised interface |
| --- | --- | --- |
| Fresh session and site selection | [Before](./before-fresh.png) | [After](./after-fresh.png) |
| Restored method controls and generation action | [Before](./before-controls.png) | [After](./after-restored-handoff.png) |
| Architecture review | [Before](./before-review.png) | [After](./after-review.png) |

The enabled action and the descriptor calculation are also available. [Ready 50/50 hybrid](./after-controls.png) · [45% Open Volume / 55% Centralized](./descriptor-controls.png) · [Phone layout](./mobile-controls.png)

## Browser verification

- An empty browser opened the design page, saw the disabled generation action, followed **Restore Miami Checkpoint** and restored all 18 orientations through the existing protected recovery route. Opening the old page first had created default records that prevented recovery.
- All 15 percentage inputs accepted edits in the restored session. A non-100% total disabled the action in each method. Entering a Gallery rule share produced a specific unsupported-pair explanation. Hybrid and descriptor full-polygon choices were acknowledged independently, and the original handoff was still applied when revisiting the area method.
- A generation attempt without a valid key was rejected and exposed the credential control. After authentication, the primary button generated an independent Stepped study, a 25% Plate / 75% Stepped study and a 45% Open Volume / 55% Centralized study. The latter two footprints were **393.72 ft²** and **381.18 ft²**.
- Each method recovered its own percentages through navigation and reload. A newly named alternative persisted and appeared in the Site Development publication selector after explicit publication. The previously unpublished Stepped proof remained unpublished. Saving the archived hybrid as an alternative reused its existing geometry.
- The independent Stepped and Plate references displayed **404.79 ft²** and **490.99 ft²**. The **Plate-influenced Stepped Amphitheater** still displayed **382.77 ft²**, **9.98%** actual coverage, and passing containment and local height checks. All three display modes and the perspective, plan, elevation and section controls worked. The 390-pixel viewport had no horizontal page overflow.

## Regression evidence

One intermediate browser run timed out waiting for the independent worker. The final build loads the legacy 3D territory viewport when its advanced workspace opens. A browser check opened the original territory tools through the area-method shortcut and verified viewport mounting and release. The complete authenticated browser test then passed for all three methods.

The build, scoped TypeScript check and changed-component lint passed. The geometry suite reproduced the archived source hash, finished mesh hash and both OBJ exports. The shared site rules, site contract and checkpoint checks passed, including 26 native bindings, 18 orientations and 13 architectural records. All 24 Evaluations tests passed. The existing Room Within Volume profile and Void Field source-collision tests passed.

The existing Lattice fixtures produced a **15.26** best facing score and a **DIRECT** transition at a 0.3-ft rise. Source selection, connection quality and the full port regression passed for 2-, 3-, 4- and 8-form cases. The bundled eight-form assembly produced six port pairs and six connector meshes. The multilevel, tall-source and source-preserving export checks also passed.

## Changed files

All application changes are under `src/components/polygonExperiment/`.

| Files | Responsibility |
| --- | --- |
| `Studio.tsx`, `Entry.tsx`, `TerritoryWorkspace.tsx`, `IntegrationPanel.tsx` | Site selection, recovery, scoped mobile navigation and direct access to the original territory workspace and on-demand display of its 3D viewport |
| `model.ts`, `GenerationMethods.tsx`, `DesignPanel.tsx`, `WorkflowAction.tsx` | Independent saved method preferences, all percentage controls, compatibility checks, direct corrective actions and the existing generation API |
| `ArchitectureReview.tsx`, `OrientationPanel.tsx`, `OrientationView.tsx`, `ArchitectureLayer.tsx` | Saved and reference studies, view controls, measurements, publication, exports and technical disclosures |
| `workflow.module.css` | Responsive page layout, percentage inputs and action hierarchy |

The screenshots and this report are under `docs/hybrid-interface/`. The implementation starts from local commits `4b60c1a` and `0c7452e`. Archived geometry, vendored Rule A/B sources, checkpoint data, shared providers and unrelated tabs match the accepted milestone. The verified hybrid relationship remains Plate-guided Stepped Rule A placement followed by authentic Stepped Rule B formation.
