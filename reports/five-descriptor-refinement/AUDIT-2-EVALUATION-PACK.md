# AUDIT 2 — Five Descriptor Updates · Evaluation Pack

**Purpose:** Independent second audit of the five descriptor updates, written so a reviewer can copy this document, score each criterion, and return a verdict.  
**Date generated:** 2026-11-08  
**Auditor role:** Code + fixture re-score (not design-studio intent review)  
**Worktree under audit:** `C:\design 7\assignment 2\Cursor-App-eval-refinement` · branch `experiment/five-descriptor-refinement`  
**Not under audit for landed fixes:** main `Cursor-App` still reports Open Volume `v4.3.1` and still scores Region-Pair / Level Distribution as measured zeros (pre-update behavior).

### Version labels

| Label | Meaning |
|---|---|
| **Prior** | First Evaluations audit (pre-update) |
| **Official-updated** | `evaluateV4` in eval-refinement: suite `v4.3.0` + Open Volume `v4.3.2` (safe-subset landing) |
| **Experimental** | Parallel suite `exp-5d-0.1` (destination Centralized + CA gathering terms; toggle only) |

### How to evaluate this pack

1. Read **Section A** (rubric definitions).  
2. Read **Section B** (fixture evidence — do not change numbers; they were regenerated 2026-11-08).  
3. Score each row in **Section C** using the 0–3 scale.  
4. Fill **Section D** verdict boxes.  
5. Return the completed Sections C–D only if attaching a review response.

**Score scale (Section C)**  
- **3** = Met with clear geometric / architectural justification  
- **2** = Mostly met; minor gaps or tuning needed  
- **1** = Partially met; do not ship without revision  
- **0** = Not met / regressive  
- **N/E** = Not enough evidence in this pack

**Tests at generation:** official `evaluateV4` fixtures **35/35** pass in this worktree (geometry + descriptor suites). Audit script: `scripts/audit-five-descriptor-updates.ts` → `audit-five-descriptor-updates.json`.

---

## Section A — Rubric (what “good” means)

| ID | Criterion | Pass condition |
|---|---|---|
| R1 | Architectural meaning | Absolute scores move in the direction a designer would expect for the tested form (e.g. undivided hall is not punished for lacking a second region). |
| R2 | Geometric validity | Components measure real mesh properties; absence is either measured zero or unavailable — never a fake measured zero for an inapplicable term. |
| R3 | N/A handling | Unavailable terms use `precise: null`, publish a reason, and are excluded from the weighted average (weights renormalize). |
| R4 | Measured-zero honesty | When a characteristic is truly absent (e.g. single-level Vertically Integrated), score is 0 with explanation and the form still ranks. |
| R5 | Evidence | Measured components have drawable layers; potential (unverified) links are drawn, not half-scored. |
| R6 | Determinism | Same mesh → same scores; published score reconstructs from components. |
| R7 | Official readiness | Safe to replace production Evaluations scoring for that descriptor without further design review. |

---

## Section B — Evidence (fixture cohort)

Synthetic meshes: `closedHall(14)`, `twoRooms()`, `atrium()` — same fixtures as the first audit.

### B1. Official-updated absolute scores (post safe-subset)

| Form | Open Volume | Visually Connected | Circulation Activated | Centralized | Vertically Integrated |
|---|---:|---:|---:|---:|---:|
| Closed hall 14 ft | 75.0 | **73.0** (Region-Pair N/A) | **58.8** (Level Dist. N/A) | 60.7 | 0.0 |
| Two rooms (partition) | 42.8 | 28.3 | **29.4** (Level Dist. N/A) | 64.0 | 0.0 |
| Roofed atrium | 53.8 | **73.4** (Region-Pair N/A) | 25.7 | 53.1 | **35.4** |

### B2. Delta vs prior audit (official-updated − prior)

| Form | Descriptor | Prior | Now | Δ | Interpretation for reviewers |
|---|---|---:|---:|---:|---|
| Closed hall 14 ft | Open Volume | 75.0 | 75.0 | 0.0 | Continuous sheltered field already applied |
| Closed hall 14 ft | Visually Connected | 51.1 | 73.0 | **+21.9** | Region-Pair no longer fake-zero |
| Closed hall 14 ft | Circulation Activated | 50.0 | 58.8 | **+8.8** | Level Distribution no longer fake-zero |
| Closed hall 14 ft | Centralized | 60.7 | 60.7 | 0.0 | Official CE unchanged |
| Closed hall 14 ft | Vertically Integrated | 0.0 | 0.0 | 0.0 | Honest single-level absence |
| Two rooms | Open Volume | 46.1 | 42.8 | **−3.4** | Clearance volume uses largest connected field only |
| Two rooms | Visually Connected | 28.4 | 28.3 | ~0 | Two regions exist; blocked pairs stay measured 0 |
| Two rooms | Circulation Activated | 25.0 | 29.4 | **+4.4** | Level Distribution N/A |
| Two rooms | Centralized | 62.8 | 64.0 | +1.2 | Minor field drift |
| Roofed atrium | Open Volume | 53.8 | 53.8 | 0.0 | Stable |
| Roofed atrium | Visually Connected | 51.4 | 73.4 | **+22.0** | Region-Pair N/A |
| Roofed atrium | Circulation Activated | 25.7 | 25.7 | 0.0 | Multi-level; Level Dist. still measured |
| Roofed atrium | Vertically Integrated | 50.4 | 35.4 | **−15.0** | Potential stairs no longer half-credited |

### B3. Experimental suite on same fixtures (`exp-5d-0.1`)

| Form | OV | VC | CA | CE | VI |
|---|---:|---:|---:|---:|---:|
| Closed hall 14 ft | 75.0 | 73.0 | **77.9** | **100.0** | 0.0 |
| Two rooms | 42.8 | 28.3 | **42.6** | 60.0 | 0.0 |
| Roofed atrium | 53.8 | 73.4 | **37.1** | **76.5** | 35.4 |

Experimental deltas vs official-updated are concentrated in **Circulation Activated** (gathering terms) and **Centralized** (destination model). OV / VC / VI match official-updated on these three fixtures.

### B4. Claim cards (one per update)

#### UPDATE 1 — Open Volume open-void continuity (`v4.3.2`)

| Field | Content |
|---|---|
| Claim | Open Void Share and open contribution to Clearance Volume credit only the largest continuous open pocket (aligned with sheltered continuous-field rule). |
| Evidence | Hall/atrium OV unchanged; partitioned rooms OV 46.1 → 42.8; notes state disconnected pockets are not credited. |
| Validity class | Measured components only (no N/A change). |
| Proposed auditor verdict | **PASS for official** — geometrically consistent; small score drop on partitioned rooms is expected. |
| Reviewer score R1–R7 | _fill in Section C_ |

#### UPDATE 2 — Visually Connected Region-Pair applicability

| Field | Content |
|---|---|
| Claim | When `regionPairsTested = 0`, Region-Pair is `unavailable` (`precise: null`), weight renormalizes over Coverage + Mean Sightline; when two regions exist but cannot see each other, Region-Pair remains **measured zero**. |
| Evidence | Hall VC 51.1 → 73.0 with N/A Region-Pair; Two rooms VC stays ~28.3 (measured Region-Pair = 0). Notes: “not penalized for missing a second region.” |
| Validity class | N/A vs measured-zero correctly distinguished. |
| Proposed auditor verdict | **PASS for official**. |
| Reviewer score R1–R7 | _fill in Section C_ |

#### UPDATE 3 — Circulation Activated Level Distribution applicability

| Field | Content |
|---|---|
| Claim | Level Distribution is unavailable when `levels < 2`; multi-level forms still measure it. |
| Evidence | Hall CA 50.0 → 58.8 (N/A Level Dist.); atrium CA unchanged 25.7. |
| Validity class | N/A renormalization. |
| Proposed auditor verdict | **PASS for official** (Level Distribution only). Gathering-class experimental CA terms are **separate** and not in this pass claim. |
| Reviewer score R1–R7 | _fill in Section C_ |

#### UPDATE 4 — Vertically Integrated verified-only circulation

| Field | Content |
|---|---|
| Claim | Vertical Circulation = verified links / slots only. Potential links drawn dashed; not scored at 0.5. |
| Evidence | Atrium VI 50.4 → 35.4; Vertical Circulation term drops potential half-credit. Single-level hall VI remains 0. |
| Validity class | Measured zero for absent vertical system; potential ≠ measured. |
| Proposed auditor verdict | **PASS for official**. |
| Reviewer score R1–R7 | _fill in Section C_ |

#### UPDATE 5 — Centralized (official vs experimental)

| Field | Content |
|---|---|
| Claim (official) | Unchanged AABB / ellipse / mass-centre proxy. Inner Clearance Dominance still ~0 on uniform rectangular halls. |
| Claim (experimental) | Destination-based Centralized (gathering destination, convergence, dominance, offset). Hall CE → **100**; atrium CE 53.1 → **76.5**. |
| Evidence | Official CE deltas ≈ 0 on hall/atrium; experimental CE jumps large. |
| Proposed auditor verdict | Official CE: **HOLD** (known ellipse/rectangle weakness). Experimental CE: **NEEDS DESIGN REVIEW** before official adoption — large rank shifts. |
| Reviewer score R1–R7 | _fill in Section C_ |

### B5. Integration / scope caveats (must not be ignored)

1. Safe-subset updates exist in **eval-refinement** official `evaluateV4`, not yet mirrored as the production path in main `Cursor-App` (main still Open Volume `v4.3.1` + Region-Pair measured-zero behavior).  
2. Office registry should use modified / 20 ft tiles — original underscaled workspace OBJs fail floor detection (false zeros).  
3. Experimental ranks must not publish into Lattice session storage until approved.  
4. Cont Hall VC can still measure zero when fewer than two eye-height origins exist (standing-sampling issue — separate from Region-Pair N/A).

---

## Section C — Reviewer scoring worksheet (copy & fill)

Mark each cell **0 / 1 / 2 / 3 / N/E**. Optional comments in the Notes column.

| Update | R1 Meaning | R2 Geometry | R3 N/A | R4 Measured 0 | R5 Evidence | R6 Determinism | R7 Official ready? | Notes |
|---|---|---|---|---|---|---|---|---|
| 1 Open Volume continuity |  |  |  |  |  |  |  |  |
| 2 VC Region-Pair N/A |  |  |  |  |  |  |  |  |
| 3 CA Level Dist. N/A |  |  |  |  |  |  |  |  |
| 4 VI verified-only |  |  |  |  |  |  |  |  |
| 5a Official Centralized |  |  |  |  |  |  |  |  |
| 5b Experimental Centralized |  |  |  |  |  |  |  |  |

**Suggested pass bar (optional):** mean(R1–R6) ≥ 2.5 and R7 ∈ {2,3} for any update marked “approve for official.”

---

## Section D — Reviewer verdict (copy & fill)

**Reviewer name / role:** _______________________  
**Date:** _______________  
**Time spent with pack:** _______________

### D1. Approve for official Evaluations tab (check all that apply)

- [ ] Open Volume open-void continuity (`v4.3.2`)  
- [ ] Visually Connected Region-Pair unavailable + renormalize  
- [ ] Circulation Activated Level Distribution unavailable + renormalize  
- [ ] Vertically Integrated verified-only circulation  
- [ ] Explain notes for unavailable components  
- [ ] None — request changes first  

### D2. Hold / do not approve yet

- [ ] Official Centralized (AABB / ellipse proxy) replacement  
- [ ] Experimental destination Centralized (`exp-5d-0.1`)  
- [ ] Experimental CA gathering-class gate  
- [ ] Other: ________________________________  

### D3. Required follow-ups before merge to main production path

1. _______________________________________________  
2. _______________________________________________  
3. _______________________________________________  

### D4. One-sentence overall judgment

> ________________________________________________________________  
> ________________________________________________________________  

### D5. Signature

Reviewer: _________________   Approver (if different): _________________

---

## Section E — Pre-filled auditor opinion (independent of reviewer)

This section is the generating auditor’s recommendation. Reviewers should score Section C independently before reading E if they want a blind evaluation.

| Update | Auditor recommendation |
|---|---|
| OV continuity | Approve for official |
| VC Region-Pair N/A | Approve for official |
| CA Level Dist. N/A | Approve for official |
| VI verified-only | Approve for official |
| Official CE | Keep as-is until destination model reviewed |
| Experimental CE / CA gathering | Keep behind toggle; design review required |

**Headline:** The two High findings from the first audit (fake zeros on Region-Pair and Level Distribution) are fixed in the eval-refinement official path; atrium VI correctly drops when potential stairs are not credited. Centralized remains the open architectural question.

**Reproduce:**  
```
cd "C:\design 7\assignment 2\Cursor-App-eval-refinement"
npx --yes tsx scripts/audit-five-descriptor-updates.ts
```

**Related:** `audit-five-descriptor-updates.json` · prior pack `audit-five-descriptor-updates.md` · recommendation `deliverable-g-recommendation.md`
