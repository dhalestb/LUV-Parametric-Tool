# Deliverable A — Baseline and coverage audit

Generated: 2026-11-07T01:18:23.117Z

## Environment / settings

- **registryDirectory:** "C:\\design 7\\assignment 2\\obj files"
- **registryDirs:** ["gathering","lobbies","workspaces\\v2\\original forms"]
- **formCount:** 15
- **descriptorAlgorithmVersion:** "v4.3.0"
- **openVolumeAlgorithmVersion:** "v4.3.1"
- **includeTopDecks:** false
- **unit:** "feet"
- **upAxis:** "y (file) → z-up analysis"
- **sampleFeet:** 1
- **clearanceMinFeet:** 5
- **clearanceReferenceFeet:** 10
- **volumeClearCapFeet:** 20
- **eyeHeightFeet:** 5.5
- **minLevelAreaFt2:** 16
- **note:** "Official Open Volume / visibility / light exclude uncovered top decks when includeTopDecks=false. UI currently defaults the toggle to true."

## Outcome summary (75 cells)

- **PASS:** 46
- **MEASURED_ZERO:** 19
- **PASS_WITH_NA_COMPONENTS:** 10

## Coverage matrix

| Form | Slot | Open Volume | Visually Connected | Circulation Activated | Centralized | Vertically Integrated | Floors | Levels | Interior ft² |
|---|---|---|---|---|---|---|---:|---:|---:|
| Gathering Linear.obj | ? | PASS (5.0) | PASS (63.3) | PASS (33.7) | PASS (47.5) | PASS (30.6) | 1061 | 4 | 880 |
| Gathering, Plate.obj | ? | PASS (11.9) | PASS (65.7) | PASS_WITH_NA_COMPONENTS (50.2) | PASS (39.5) | MEASURED_ZERO (0.0) | 648 | 1 | 537 |
| Gathering, Room within Volume.obj | G4 | PASS (30.2) | PASS_WITH_NA_COMPONENTS (41.4) | PASS_WITH_NA_COMPONENTS (78.7) | PASS (34.3) | MEASURED_ZERO (0.0) | 525 | 1 | 324 |
| Gathering, Stepped.obj | ? | PASS (3.9) | PASS_WITH_NA_COMPONENTS (46.6) | PASS (51.7) | PASS (44.1) | PASS (19.0) | 570 | 3 | 304 |
| Gathering, Void Field.obj | G2 | PASS (2.9) | PASS (63.1) | PASS_WITH_NA_COMPONENTS (45.5) | PASS (41.0) | MEASURED_ZERO (0.0) | 531 | 1 | 373 |
| Lobby, Cont Hall.obj | ? | PASS (0.4) | MEASURED_ZERO (0.0) | PASS_WITH_NA_COMPONENTS (79.4) | PASS (59.5) | MEASURED_ZERO (0.0) | 341 | 1 | 206 |
| Lobby, Ground Field.obj | L4 | PASS (6.8) | PASS (46.5) | PASS (64.5) | PASS (43.4) | PASS (33.7) | 1103 | 3 | 893 |
| Lobby, Linear.obj | ? | PASS (8.4) | PASS_WITH_NA_COMPONENTS (33.5) | PASS (56.8) | PASS (47.9) | PASS (30.7) | 616 | 3 | 518 |
| Lobby, Sequential.obj | ? | PASS (7.6) | PASS (20.1) | PASS (38.2) | PASS (47.0) | PASS (27.2) | 698 | 4 | 589 |
| Lobby, Vertical Void.obj | L1 | PASS (16.3) | PASS_WITH_NA_COMPONENTS (45.2) | PASS (53.1) | PASS (25.9) | PASS (21.4) | 1373 | 3 | 1135 |
| cascaded workspace.obj | O2 | PASS (6.3) | MEASURED_ZERO (0.0) | MEASURED_ZERO (0.0) | PASS (28.1) | MEASURED_ZERO (0.0) | 18 | 0 | 11 |
| flat deep-plate workspace.obj | ? | PASS (9.5) | MEASURED_ZERO (0.0) | PASS_WITH_NA_COMPONENTS (23.3) | PASS (55.1) | MEASURED_ZERO (0.0) | 57 | 1 | 40 |
| open hall workspace.obj | O1 | MEASURED_ZERO (0.0) | MEASURED_ZERO (0.0) | MEASURED_ZERO (0.0) | PASS (22.6) | MEASURED_ZERO (0.0) | 0 | 0 | 0 |
| undulating workspace.obj | O5 | PASS (7.7) | MEASURED_ZERO (0.0) | MEASURED_ZERO (0.0) | PASS (34.8) | MEASURED_ZERO (0.0) | 25 | 0 | 14 |
| void edge workspace.obj | O4 | PASS (0.2) | MEASURED_ZERO (0.0) | PASS_WITH_NA_COMPONENTS (25.5) | PASS (19.4) | MEASURED_ZERO (0.0) | 44 | 1 | 33 |

## Failures and questionable results

### Gathering, Plate.obj
- **Circulation Activated** — PASS_WITH_NA_COMPONENTS
  - Cause: N/A components scored as measured zero: Level Distribution.
  - Proposed correction: Mark those components unavailable so weights renormalize; do not invent architecture.

### Gathering, Room within Volume.obj
- **Visually Connected** — PASS_WITH_NA_COMPONENTS
  - Cause: N/A components scored as measured zero: Region-Pair Connection.
  - Proposed correction: Mark those components unavailable so weights renormalize; do not invent architecture.
- **Circulation Activated** — PASS_WITH_NA_COMPONENTS
  - Cause: N/A components scored as measured zero: Level Distribution.
  - Proposed correction: Mark those components unavailable so weights renormalize; do not invent architecture.

### Gathering, Stepped.obj
- **Visually Connected** — PASS_WITH_NA_COMPONENTS
  - Cause: N/A components scored as measured zero: Region-Pair Connection.
  - Proposed correction: Mark those components unavailable so weights renormalize; do not invent architecture.

### Gathering, Void Field.obj
- **Circulation Activated** — PASS_WITH_NA_COMPONENTS
  - Cause: N/A components scored as measured zero: Level Distribution.
  - Proposed correction: Mark those components unavailable so weights renormalize; do not invent architecture.

### Lobby, Cont Hall.obj
- **Circulation Activated** — PASS_WITH_NA_COMPONENTS
  - Cause: N/A components scored as measured zero: Level Distribution.
  - Proposed correction: Mark those components unavailable so weights renormalize; do not invent architecture.

### Lobby, Linear.obj
- **Visually Connected** — PASS_WITH_NA_COMPONENTS
  - Cause: N/A components scored as measured zero: Region-Pair Connection.
  - Proposed correction: Mark those components unavailable so weights renormalize; do not invent architecture.

### Lobby, Vertical Void.obj
- **Visually Connected** — PASS_WITH_NA_COMPONENTS
  - Cause: N/A components scored as measured zero: Region-Pair Connection.
  - Proposed correction: Mark those components unavailable so weights renormalize; do not invent architecture.

### flat deep-plate workspace.obj
- **Circulation Activated** — PASS_WITH_NA_COMPONENTS
  - Cause: N/A components scored as measured zero: Level Distribution.
  - Proposed correction: Mark those components unavailable so weights renormalize; do not invent architecture.

### void edge workspace.obj
- **Circulation Activated** — PASS_WITH_NA_COMPONENTS
  - Cause: N/A components scored as measured zero: Level Distribution.
  - Proposed correction: Mark those components unavailable so weights renormalize; do not invent architecture.

## Measured zeros (legitimate absences)

- **Gathering, Plate.obj / Vertically Integrated** — score 0. One architectural level. Vertical integration is absent (scored 0). The form is still ranked. Upper perimeter openings, if any, are potential future connections, not verified circulation.
- **Gathering, Room within Volume.obj / Vertically Integrated** — score 0. One architectural level. Vertical integration is absent (scored 0). The form is still ranked. Upper perimeter openings, if any, are potential future connections, not verified circulation.
- **Gathering, Void Field.obj / Vertically Integrated** — score 0. One architectural level. Vertical integration is absent (scored 0). The form is still ranked. Upper perimeter openings, if any, are potential future connections, not verified circulation.
- **Lobby, Cont Hall.obj / Visually Connected** — score 0. Fewer than two eye-height viewing positions share a detected level. Visual connection is absent (scored 0) and the form is still ranked.
- **Lobby, Cont Hall.obj / Vertically Integrated** — score 0. One architectural level. Vertical integration is absent (scored 0). The form is still ranked. Upper perimeter openings, if any, are potential future connections, not verified circulation.
- **cascaded workspace.obj / Visually Connected** — score 0. Fewer than two eye-height viewing positions share a detected level. Visual connection is absent (scored 0) and the form is still ranked.
- **cascaded workspace.obj / Circulation Activated** — score 0. No supported movement surface was found. Circulation is absent (scored 0) and the form is still ranked.
- **cascaded workspace.obj / Vertically Integrated** — score 0. One architectural level. Vertical integration is absent (scored 0). The form is still ranked. Upper perimeter openings, if any, are potential future connections, not verified circulation.
- **flat deep-plate workspace.obj / Visually Connected** — score 0. Fewer than two eye-height viewing positions share a detected level. Visual connection is absent (scored 0) and the form is still ranked.
- **flat deep-plate workspace.obj / Vertically Integrated** — score 0. One architectural level. Vertical integration is absent (scored 0). The form is still ranked. Upper perimeter openings, if any, are potential future connections, not verified circulation.
- **open hall workspace.obj / Open Volume** — score 0. No interior floor surface found. Open Volume is absent (scored 0) and the form is still ranked.
- **open hall workspace.obj / Visually Connected** — score 0. Fewer than two eye-height viewing positions share a detected level. Visual connection is absent (scored 0) and the form is still ranked.
- **open hall workspace.obj / Circulation Activated** — score 0. No supported movement surface was found. Circulation is absent (scored 0) and the form is still ranked.
- **open hall workspace.obj / Vertically Integrated** — score 0. One architectural level. Vertical integration is absent (scored 0). The form is still ranked. Upper perimeter openings, if any, are potential future connections, not verified circulation.
- **undulating workspace.obj / Visually Connected** — score 0. Fewer than two eye-height viewing positions share a detected level. Visual connection is absent (scored 0) and the form is still ranked.
- **undulating workspace.obj / Circulation Activated** — score 0. No supported movement surface was found. Circulation is absent (scored 0) and the form is still ranked.
- **undulating workspace.obj / Vertically Integrated** — score 0. One architectural level. Vertical integration is absent (scored 0). The form is still ranked. Upper perimeter openings, if any, are potential future connections, not verified circulation.
- **void edge workspace.obj / Visually Connected** — score 0. Fewer than two eye-height viewing positions share a detected level. Visual connection is absent (scored 0) and the form is still ranked.
- **void edge workspace.obj / Vertically Integrated** — score 0. One architectural level. Vertical integration is absent (scored 0). The form is still ranked. Upper perimeter openings, if any, are potential future connections, not verified circulation.
