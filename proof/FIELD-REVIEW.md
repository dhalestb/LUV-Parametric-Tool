# Selection field dimensions and open amphitheater proof

## Interface and scope

Open http://127.0.0.1:4178/controls. Run node proof/field-server.cjs with the existing dependency directory on NODE_PATH to restart it. The local server listens on 127.0.0.1 only.

The pre-generation form orders source selection, independent Width X / Length Y / Height Z, major occupied level spacing, category and typology, then Generate. Each axis offers 20/40/60. Changing any control marks the request stale. A result from an older request cannot replace the changed configuration. The cache key includes all three axes, spacing, category/typology and the exact source fixture. Switching category preserves the field values; Office/Lobby generation is explicitly unavailable in this proof. Source registration is recorded separately at 20 x 20 x 20. The only available source in this demonstration is the recorded Composition review fixture. Live source selection is a future integration item.

field-config.cjs validates all 27 combinations and the independent 12–15-foot major-level control. There is no typology-to-dimension assignment. API generation with the recorded source completed and returned a working gallery URL. Startup defaults are 20/20/20 and 12 feet.

## Native geometric dimensions and population

field-amphitheater.cjs is an isolated extension of relationship-amphitheater.cjs. The historical proof files and checkpoints remain available. Architecture is constructed in selected field coordinates. No post-generation scaling is performed.

Existing letter sizing uses controlsFromPreset and scaleFromFootprintFeet, unchanged, for the controlled fixture: 9/11/13-foot preferred footprints at heights 20/40/60. Exported source requests retain their own scales. Plan dimensions affect feasibility and population rather than silently redefining those sizes.

The existing height-responsive baseline supplies a count and number of complementary L/U/V regions. Additional plan width admits floor(width / (1.25 * representative letter width)) side-by-side lanes. Additional plan depth admits floor((depth - 20) / (0.9 * representative width)) extra terrace regions. The baseline region count plus those extra regions determines the number of tiers. Full regions use complementary selected letters with unique source-linked instance IDs. The original compact baseline retains its partial last region and seven instances.

These packing distances are controlled proof parameters, not new approved architectural requirements or a maximum letter count. Actual transformed source containment and focus clearance are mandatory. Infeasible configurations throw an explicit conflict. All 27 configurations were validated at the configuration level; actual geometry was generated for six fixtures, not all 27.

Regions ascend behind a broad front gathering space. Tier positions use actual available plan depth after reserving the focus and rotated-source margins. Minor rise is calculated separately from major-level spacing and constrained by height, including upright V extent. Multiple lanes share each tier. Increasing depth creates more spatial regions instead of forcing one letter per level.

## Four required fixtures

|Field X/Y/Z ft|Letters|Letter preferred size ft|Shared tiers|Architecture spans X/Y/Z ft|Volume ft3|Focal clear area W/D ft|
|---|---:|---:|---:|---|---:|---|
|20/20/20|7|9|3|8.950/12.059/14.312|199.541|5.4/4.4|
|40/40/20|45|9|5|34.936/31.046/19.362|1641.527|11.2/6.3|
|60/40/40|72|11|6|54.325/29.343/39.220|4813.988|16.8/7.7|
|60/60/60|81|13|9|53.293/47.066/59.079|9196.435|16.8/9.1|

Minor terrace elevations are 1.08/6.13/11.18; 1.08/3.605/6.13/8.655/11.18; 1.32/6.9/12.48/18.06/23.64/29.22; and 1.56/7.2725/12.985/18.6975/24.41/30.1225/35.835/41.5475/47.26 feet respectively. Exact bounds, instance sizes, group IDs, applied orientation, feature coordinates and component provenance are in field-review/measurements.json and each derivation JSON.

Width-only 40/20/20 generates 27 letters and depth-only 20/40/20 generates 15 letters. Both have NoError and one material region. They differ from each other and from the compact baseline in actual mesh coordinates and population. plan-axis-review contains their independent galleries.

## Architectural operations and verification

Terraces originate from L inner edges and ruled L/U boundary relationships. Enclosures use sampled actual U curves and their offset tangents. V arm/apex geometry constructs angular connections to neighboring edges; stepped paths are anchored to these source relationships. Source rotations and the disabled-by-default explicitly scoped yaw override logic remain in the isolated proof.

The broad focal volume extends upward in front of the ascending tiers. It is clear of both source letters and generated architecture in all four fixtures. Detached overhead cover patches were removed from this new study; the local U boundary mass retains pocket roofs. No full floors cross the open focal volume merely to satisfy major spacing.

All final four meshes are NoError, have one positive material shell and zero outside volume. Actual clipping removed zero volume. Negative cavity-shell volumes are retained in measurements and need review, including a roughly 0.0314 ft3 cavity in the largest study. They have not been discarded or hidden by relaxed tolerances.

All 27 independent configuration and cache tests pass. Actual geometry validation verifies source containment, provenance, allowed orientations, opening/pocket clearance and larger-than-20-foot plan development. All 29 existing native-height regression tests pass. The live server was exercised through its generation API, including successful job completion. Browser interaction itself was not automated.

## Major levels, clear heights and unresolved constraints

The 12-foot default, editable 12–15-foot major-level control defines proposed planning elevations separately from minor tiers. The proof currently constructs minor terraces and boundary pockets. It does not implement occupied major decks or certify their floor-to-floor/clear-height relationships. Changing this setting changes the request identity and proposed major planning elevations. It currently does not change the terrace mesh where no major occupied deck is generated.

Alcove headroom remains inadequate for verified occupation. Steps, landings, interlevel covers, circulation routing across lanes, views toward the focus, structural plausibility, and accessible movement remain unverified. The clear front gathering volume is measured; a usable stage floor and an occupied auditorium program have not been established. Geometric connectivity does not prove an uninterrupted usable circulation route. The generated gallery has fixed comparable 60-foot framing.

The wider studies demonstrate source-derived spatial development. Architectural recognition and full Rule 1A/1B compliance require review. The known A/B/C round-trip defect remains unresolved. Height/plan packing and focal-area proportions are disclosed fixture choices, not additions to the authoritative rule specification.

## Specific production integration plan

1. Introduce one shared validated architectural-field request type carrying X/Y/Z and major-level spacing, independent of category/typology. Carry the selected Composition ID and source registration separately.
2. Put the three controls after alternative selection and before typology selection. Typology switching must preserve them. Keep fixed-grid pitch and letter sizing independent.
3. Include all dimensions and original source identity in API requests, regeneration/edit snapshots and cache keys. Version serialized snapshots; migrate legacy requests to 20/20/existing-height.
4. Convert Composition coordinates to Z-up geometry at the existing boundary. Pass the complete native envelope into fit, clipping and final validation rather than converting it to source registration or stretching.
5. Test the shared transport on all categories without replacing Office/Lobby typology rules. Extend geometry to those categories only after separate authorization and validation.
6. Resolve the major-deck implementation and clear-height verification before exposing its setting as a verified occupied-level feature. Retain the separate minor-terrace controls.
7. Verify live Composition transfer, all 27 configurations, legacy selections, independent controls, source identity, and actual dimensional geometry before merging. No production integration is performed by this checkpoint.
