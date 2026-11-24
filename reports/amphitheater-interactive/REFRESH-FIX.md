# Composition source refresh fix

Root cause: refresh filtered the source list down to fixture/custom and currently imported Composition alternatives. A source loaded from a saved architectural study (such as shape-change / U depth +3%) disappeared while sourceId still referenced it. The HTML select visually showed another option, but the actual source lookup returned undefined, disabling generation.

Fix: merge newly imported source IDs while retaining the currently selected saved-study snapshot. Replace matching live IDs with their updated Composition data; remove unavailable unselected live entries. Refresh initialization is separate from selection changes, so changing a source no longer risks rerunning API initialization. Refresh reports how many Composition sources were found and explains empty/corrupt-storage states. The selected source survives these states. A direct link opens Composition on the same origin. Refresh updates the input list; Generate baseline study produces new geometry.

Verification:
- Five focused regression tests pass: saved-source preservation, matching-ID replacement without duplicates, removal of unselected stale entries, identity/pose correspondence, and useful refresh messages.
- TypeScript passes.
- Changed-code lint passes.
- Production build passes with existing unrelated warnings.
- Browser tested the user's saved 40/40/40 ft study with 13 ft letters. Source U depth +3% remains selected after repeated refreshes, Generate stays enabled, and the displayed study URL does not change on refresh.
- A regenerated result was observed with the same source and field settings: 18 instances, 1899.670 ft³, zero independent triangle crossings. Existing architectural backing failures remain disclosed and unchanged.
- No current/saved Composition optimization alternatives exist on this origin during this test. Empty-state feedback is displayed; the saved architectural study's source is still available.

Current study: http://127.0.0.1:4181/amphitheater?study=9358c807-a459-4e31-86f3-33b15e138e58

To obtain additional Composition inputs, open /composition at port 4181, generate an alternative, then return and refresh the source list. Browser storage on a different port is separate. No source poses, field dimensions, generator rules or mesh validation requirements were changed by this fix. Protected production and the original proof remain untouched.
