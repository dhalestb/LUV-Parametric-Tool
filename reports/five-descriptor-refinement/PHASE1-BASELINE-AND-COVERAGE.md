# Phase 1 — Baseline environment + Deliverable A

**Status:** Analysis complete. Official evaluation behavior has **not** been changed.  
**Experimental worktree:** `C:\design 7\assignment 2\Cursor-App-eval-refinement`  
**Experimental branch:** `experiment/five-descriptor-refinement`  
**No commit / push / merge performed.**

---

## 1.1 Working environment

| Item | Value |
|---|---|
| Active main worktree | `C:\design 7\assignment 2\Cursor-App` |
| Active branch (main worktree) | `feature/descriptor-comparison-clean` @ `5573733` |
| Experimental worktree | `C:\design 7\assignment 2\Cursor-App-eval-refinement` |
| Experimental branch | `experiment/five-descriptor-refinement` @ `5573733` (created from HEAD) |
| Remote | `https://github.com/dhalestb/LUV-Parametric-Tool.git` |
| HEAD commit message | `feat: score Sequential as verified ascent and add the revised Composition tools` |

### Descriptor versions

| Version | Where |
|---|---|
| Suite `v4.3.0` | Committed on HEAD and local WIP |
| Open Volume `v4.3.1` (continuous-field sheltered scoring) | **Local uncommitted WIP only** in main worktree — **not** in committed HEAD, **not** yet copied into experimental worktree |
| Legacy `v3.5` | Voxel evaluator retained for comparison |

**Do not confuse:** surface-based v4 ≠ voxel-based v3.5. Scores from different versions or deck settings are not comparable without labeling those differences.

### Geometric constants (current v4)

| Setting | Value |
|---|---|
| Units | feet |
| File up-axis | Y |
| Analysis coordinate system | spec-feet-z-up |
| Floor sample spacing | 1 ft |
| Upward floor normal gate | 0.68 |
| Clearance min (no credit) | 5 ft |
| Clearance full credit | 10 ft |
| Volume height cap | 20 ft (computational; not a measured ceiling) |
| Eye height | 5.5 ft |
| Min interior level area | 16 ft² |
| Min interface area | 4 ft² |
| Level merge tolerance | 1.5 ft |
| Official top decks | **excluded** (`includeTopDecks=false`) |
| UI toggle default | currently **true** (differs from official) |

### Source of the 15 original OBJs

Registry path (outside repo): `C:\design 7\assignment 2\obj files`

| Category | Folder | Count |
|---|---|---|
| Gathering | `gathering\` | 5 |
| Lobby | `lobbies\` | 5 |
| Office / Workspace | `workspaces\v2\original forms\` | 5 |

Bundled `/public/part2-samples/` tiles are **not** substitutes for this audit.

---

## 1.2 Coverage audit (Deliverable A)

**Evaluator used:** main worktree WIP (suite v4.3.0 + Open Volume v4.3.1)  
**Settings:** official `includeTopDecks=false`  
**Artifacts:**

- `deliverable-a-coverage-official-no-top-decks.md` / `.json`
- `deliverable-a-coverage-with-top-decks.md` / `.json` (UI-toggle comparison)

### Outcome summary — 75 cells (official, no top decks)

| Outcome | Count | Meaning |
|---|---:|---|
| PASS | 46 | Positive score with evidence layers |
| MEASURED_ZERO | 19 | Characteristic absent / scored 0 with explanation |
| PASS_WITH_NA_COMPONENTS | 10 | Positive score, but N/A terms forced to measured 0 |
| PROCESSING_FAILURE | 0 | Import/compute crash |
| VISUALIZATION_FAILURE | 0 | Score without layers (auto-detected) |
| INSUFFICIENT_EVIDENCE | 0 | Zero without absence note |

**Important:** Several MEASURED_ZERO rows on workspace forms are **not architecturally legitimate zeros**. They are symptoms of failed / underscaled floor detection (see below). Classification was based on evaluator notes; Phase 2 must reclassify those as geometry-processing problems.

### Coverage matrix (official, scores rounded)

| Form | Likely slot | OV | VC | CA | CE | VI | Floors | Levels | Interior ft² |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Gathering Linear.obj | G5 | 5.0 PASS | 63.3 PASS | 33.7 PASS | 47.5 PASS | 30.6 PASS | 1061 | 4 | 880 |
| Gathering, Plate.obj | G3 | 11.9 PASS | 65.7 PASS | 50.2 NA* | 39.5 PASS | 0 ZERO | 648 | 1 | 537 |
| Gathering, Room within Volume.obj | G4 | 30.2 PASS | 41.4 NA* | 78.7 NA* | 34.3 PASS | 0 ZERO | 525 | 1 | 324 |
| Gathering, Stepped.obj | G1 | 3.9 PASS | 46.6 NA* | 51.7 PASS | 44.1 PASS | 19.0 PASS | 570 | 3 | 304 |
| Gathering, Void Field.obj | G2 | 2.9 PASS | 63.1 PASS | 45.5 NA* | 41.0 PASS | 0 ZERO | 531 | 1 | 373 |
| Lobby, Cont Hall.obj | L3 | 0.4 PASS | 0 ZERO† | 79.4 NA* | 59.5 PASS | 0 ZERO | 341 | 1 | 206 |
| Lobby, Ground Field.obj | L4 | 6.8 PASS | 46.5 PASS | 64.5 PASS | 43.4 PASS | 33.7 PASS | 1103 | 3 | 893 |
| Lobby, Linear.obj | L5 | 8.4 PASS | 33.5 NA* | 56.8 PASS | 47.9 PASS | 30.7 PASS | 616 | 3 | 518 |
| Lobby, Sequential.obj | L2 | 7.6 PASS | 20.1 PASS | 38.2 PASS | 47.0 PASS | 27.2 PASS | 698 | 4 | 589 |
| Lobby, Vertical Void.obj | L1 | 16.3 PASS | 45.2 NA* | 53.1 PASS | 25.9 PASS | 21.4 PASS | 1373 | 3 | 1135 |
| cascaded workspace.obj | O2 | 6.3 PASS | 0 ZERO‡ | 0 ZERO‡ | 28.1 PASS | 0 ZERO‡ | 18 | **0** | 11 |
| flat deep-plate workspace.obj | O3 | 9.5 PASS | 0 ZERO‡ | 23.3 NA* | 55.1 PASS | 0 ZERO‡ | 57 | 1 | 40 |
| open hall workspace.obj | O1 | 0 ZERO‡ | 0 ZERO‡ | 0 ZERO‡ | 22.6 PASS | 0 ZERO‡ | **0** | **0** | **0** |
| undulating workspace.obj | O5 | 7.7 PASS | 0 ZERO‡ | 0 ZERO‡ | 34.8 PASS | 0 ZERO‡ | 25 | **0** | 14 |
| void edge workspace.obj | O4 | 0.2 PASS | 0 ZERO‡ | 25.5 NA* | 19.4 PASS | 0 ZERO‡ | 44 | 1 | 33 |

\* `PASS_WITH_NA_COMPONENTS` — Region-Pair Connection and/or Level Distribution scored as measured 0 though N/A.  
† Cont Hall VC zero: fewer than two viewing positions on a detected level (questionable for a hall — investigate standing sampling).  
‡ Workspace zeros tied to **scale / floor-detection failure**, not proven architectural absence.

---

## Critical geometric finding — workspace originals are not 20 ft tiles

Bounds under unitScale=1, up=Y:

| Mesh | Size (analysis ft) | Plan diagonal | Notes |
|---|---|---:|---|
| open hall workspace (v2 original) | **14.7 × 1.4 × 13.7** | 14.8 | Height **1.4 ft** < 5 ft clearance gate → **0 floors** |
| cascaded workspace (v2 original) | 15.8 × 2.4 × 13.4 | 16.0 | Interior 11 ft² → **0 levels** (< 16 ft²) |
| undulating workspace (v2 original) | 17.4 × 2.0 × 14.5 | 17.5 | Interior 14 ft² → **0 levels** |
| flat deep-plate (v2 original) | 20.3 × 1.3 × 18.6 | 20.4 | Only 40 ft² interior |
| void edge (v2 original) | 16.1 × 6.1 × 15.7 | 17.3 | Only 33 ft² interior |
| open hall shrinkwrapped v2.3 | **20 × 20 × 20** | 28.3 | Matches gathering/lobby tile scale |
| Gathering, Plate | **20 × 20 × 20** | 28.3 | Reference |

**Cause:** Registry uses `workspaces\v2\original forms`, which are drastically smaller than the gathering/lobby 20 ft forms (and smaller than shrinkwrapped workspace tiles). Treating those coordinates as feet makes standing clearance and level-area gates fail.

**Proposed correction (do not apply without approval):**

1. Confirm intended units/scale for workspace originals with the project owner.  
2. Either point the registry at correctly scaled exports (e.g. shrinkwrapped / modified forms if those are the approved originals), or apply a documented unitScale during import — **without editing OBJ files**.  
3. Re-run the 15×5 matrix after scale correction.  
4. Keep false MEASURED_ZERO results out of architectural ranking until floors detect correctly.

---

## Audit findings that match the prior eight-item developer audit

| ID | Observation on the 15 forms |
|---|---|
| VC-1 Region-Pair N/A→0 | Seen on G1, G4, L1, L5, etc. (`PASS_WITH_NA_COMPONENTS`) |
| CA-1 Level Distribution N/A→0 | Seen on single-level G2, G3, G4, L3, O3, O4 |
| CE bbox / inner clearance | Centralized still returns scores on underscaled workspaces (mass proxy only) — weak architectural meaning |
| OV continuity | OV v4.3.1 local WIP limits sheltered field; open-void global count still asymmetric |
| VI potential credit | Multi-level gathering/lobby forms score VI > 0; verify potential vs verified in Phase 3 |
| Explain gaps | Notes exist for many zeros; N/A measured-zero reasons still under-exposed in UI |

---

## What Phase 1 does **not** change

- No official score formulas replaced  
- No original OBJ files modified  
- No commit / push / PR  
- No Composition / Lattice / typology / Site Development changes  
- Experimental branch is empty of methodology edits pending approval of this baseline

---

## Recommended next step (awaiting approval)

1. Resolve workspace OBJ scale/registry assignment (**blocking** for Office forms).  
2. Copy or rebase the local OV v4.3.1 WIP into `experiment/five-descriptor-refinement` as the labeled baseline.  
3. Begin Phase 2 shared occupiable-space detection **only after** scale/assignment is decided.  
4. Defer descriptor scoring/presentation changes until Deliverable A is accepted.
