# PROJECT_CONTEXT — Development Handoff

**Repo:** [dhalestb/LUV-Parametric-Tool](https://github.com/dhalestb/LUV-Parametric-Tool)  
**Workspace:** `C:\design 7\assignment 2\Cursor-App`  
**Active branch:** `feature/descriptor-comparison-clean` @ `8ea3d36`  
**Tracking:** `origin/feature/descriptor-comparison-clean` (synced; local uncommitted Evaluations work below)  
**Date:** 2026-10-22  

This document is enough for a new agent to continue without prior chat history.

---

## 1. Purpose, architecture, and current implementation

### Purpose

Design 7 parametric studio for letter/void composition, lattice assembly of 15 architectural OBJs, and **surface-based architectural descriptor evaluation** (Open Volume and 11 related descriptors). Used for studio comparison boards and presentation exports—not code/accessibility/daylight certification.

### Stack

- **Next.js 15.5** (App Router) + **React 19** + **TypeScript** + **Tailwind 4**
- **Three.js** / `@react-three/fiber` / `@react-three/drei` for 3D
- **manifold-3d**, **rhino3dm** for fused mesh / `.3dm` export on Slide
- Scripts: `npm run dev` → `http://localhost:3000`

### App routes (`AppNav`)

| Route | Role |
|---|---|
| `/` (Slide) | Letter grid, 3D layers, section plane, fused OBJ/3DM export |
| `/crops` | Crop evaluation grids |
| `/shapes`, `/voids` | Shape / void previews |
| `/composition` | Parametric spatial optimizer + amphitheater prototype |
| `/evaluations` | **Primary focus of recent work** — load OBJs, analyze, compare, export |
| `/lattice` | 15-slot lattice source registry, assembly, ports |

Board presentation: `?board=7407x2160` (see `BOARD_MODE.md`). Capture: `&capture=1`.

### Evaluations architecture (v4.1)

**Active algorithm:** `DESCRIPTOR_ALGORITHM_VERSION = "v4.1"` (`descriptorVersion.ts`). Legacy voxel path retained as **v3.5** for comparison APIs.

Shared pipeline:

1. Parse OBJ → `analyzeMesh` → `evaluateTileModel` → v4 context (`buildV4Context`)
2. Floor field from plan-grid vertical samples (`v4/surfaces.ts`): classes `sheltered | obstructed | openVoid | exposed | uncertain`; roof lids marked separately
3. Circulation network on eligible floor nodes (`v4/circulation.ts`)
4. Twelve evaluators in `v4/evaluateV4.ts` (Open Volume first)
5. Session comparative ranks via `assignComparativeRanks` / `assignRelativeRanks`
6. Comparison UI: least/most by absolute score (`comparisonSelection.ts`); evidence layers; PNG/SVG/3D PNG export

**Open Volume (v4)** scores interior clear height only:

- Credit for sheltered clearance: **0 at ≤ 5 ft**, full at **≥ 10 ft**
- Open-to-sky voids with lateral enclosure count; **exposed exterior / roof tops do not** count toward interior open volume
- Rank **1 = weakest**, highest rank = strongest; measured **0 is ranked**; NaN only for processing failure

Example: **Lobby Continuous Hall / Cont Hall** ranks near bottom (~1.6) because the mesh is mostly an **uncovered deck at ~18.9 ft** with ~0 ft² interior—top is classified **exposed**, not sheltered occupiable interior.

### Lattice source registry (server)

`/api/open-volume-registry` ranks all descriptors over the official 15 OBJs on disk (first call measures; result cached in-process). Paths are machine-local (see §5).

---

## 2. Relevant files and dependencies

### Core Evaluations

| Path | Role |
|---|---|
| `src/app/evaluations/page.tsx` | Route shell |
| `src/components/evaluations/ArchitecturalEvaluations.tsx` | Load/analyze UI, session ranks, explain panel |
| `src/components/evaluations/DescriptorComparison.tsx` | Least/most boards, view modes, exports |
| `src/components/evaluations/objDescriptorAnalysis.ts` | Tile evaluation entry, publish ranks |
| `src/components/evaluations/descriptorRank.ts` | Comparative ranking |
| `src/components/evaluations/descriptorVersion.ts` | `v4.1` / `v3.5` constants |
| `src/components/evaluations/formIdentity.ts` | Filename matching (incl. `cont` → `continuous`) |
| `src/components/evaluations/comparisonBoard.ts` | Board paint/SVG + **export size presets** |
| `src/components/evaluations/comparisonSelection.ts` | Least/most selection |
| `src/components/evaluations/v4/*` | Surfaces, circulation, visibility, voids, evidence, `evaluateV4` |
| `src/server/registryOpenVolume.ts` | Disk registry scoring |
| `src/app/api/open-volume-registry/route.ts` | GET ranks JSON |
| `src/app/api/review-pair/route.ts` | Serve named review OBJs |

### Lattice / shared

| Path | Role |
|---|---|
| `src/components/lattice/latticeSource.tsx` | Mesh assignment, samples, browser persistence |
| `src/components/lattice/slots.ts` | G1–G5, O1–O5, L1–L5 |
| `src/components/lattice/LatticeStudio.tsx` | Lattice UI |
| `public/part2-samples/` | Bundled sample OBJs (slot-prefixed names) |

### External OBJ corpus (not in git)

`C:\design 7\assignment 2\obj files\`

- `gathering\` (5)
- `lobbies\` (5)
- `workspaces\v2\original forms\` (5) ← registry workspaces set

### Docs / reports (read-only context)

- `reports/descriptor-v4/` — A–E specs, before/after, level audit, comparison JSON  
- `reports/descriptor-measurement-audit/` — v3.5 measurement audit  
- `BOARD_MODE.md`, `README.md`

### Key dependencies

`next`, `react`, `three`, `@react-three/fiber`, `@react-three/drei`, `manifold-3d`, `rhino3dm`, `tailwindcss`, `typescript`.

---

## 3. Completed features and working functionality

### Product (on branch tip + prior merges)

- Slide letter grid, 3D layers, section plane, fused export  
- Composition optimizer and amphitheater prototype  
- Lattice 15-slot source workflow, sample load, assembly tools  
- Global architectural UI color system  
- Presentation / board mode (`7407×2160`)  
- Evaluations: Analyze All Forms, 12 descriptors, least/most comparison, evidence overlays, Export PNG / SVG / **Export 3D PNG**  
- v4.1 surface evaluators with evidence layers and legacy v3.5 retained for registry payload  
- Session storage publish of ranks for Lattice consumers  

### Local uncommitted work (do not discard without asking)

Working tree differs from `8ea3d36` in 7 files:

1. **Local registry path** — `registryOpenVolume.ts` + `review-pair` point at this machine’s `obj files` folders (recursive category dirs), not DHale’s Codex path.  
2. **Session ranking in Evaluations UI** — ranks shown are **analyzed session comparative ranks**, not `/api/open-volume-registry` filename lookup (fixes “score without rank” when sample/upload names ≠ registry basenames).  
3. **formIdentity** — `cont` ↔ `continuous` alias + tests.  
4. **Export presets** — `1284 × 494` (“slide”) added to `BOARD_PRESETS`.  
5. **Export 3D PNG** — blue footer note removed; **1284×494-only** layout: panels fill under score text to **~24px (¼″ @ 96dpi) bottom margin**, bottom-aligned; other presets keep original framing (`panelTop 0.22`, `panelHeight 0.56`).  

Also: `git stash@{0}` holds a `presentation-mode` `package-lock.json` temp stash—unrelated to Evaluations.

---

## 4. Outstanding bugs and development tasks

### Known issues / product gaps

- **Hardcoded Windows paths** for registry/review OBJs — breaks on other machines until path is env-configurable or checked in.  
- **Sample OBJ names** (`G5-Linear-Edge-Gallery.obj`, etc.) still poorly match official basenames for any **registry-based** tooling; session ranking mitigates Evaluations UI only.  
- **Export PNG vs view mode** — **Export PNG** always paints the **section comparison board**; isometric/etc. require **Export 3D PNG**. Easy to confuse.  
- **Open Volume “top space”** — exposed decks/roofs correctly excluded by design; forms like Cont Hall look “empty” on OV evidence because almost all surface is exposed deck, not a bug in ranking math.  
- **Sequential ties** — many forms share discrete scores (e.g. 6.25); “most” is score + stable id/filename tie-break, not fine-grained difference.  
- **No UI to force an occupiable route** — Sequential/circulation only analyze geometry-derived networks; only option knob on context is `eyeHeightFeet`.  
- **`main` local branch behind `origin/main` by 6** — merge/rebase hygiene when returning to main.  
- Uncommitted Evaluations/path changes **not pushed**; remote tip still assumes DHale registry path.

### Suggested tasks (not started)

- [ ] Env var / config for `REGISTRY_DIRECTORY` (and review-pair)  
- [ ] Optional dual mode: session ranks vs official 15-file registry ranks (toggle)  
- [ ] Stronger sample↔registry identity map for Lattice sample filenames  
- [ ] Clarify or merge Export PNG / Export 3D PNG UX  
- [ ] Commit local Evaluations + path fixes on a dedicated branch if they should ship  

---

## 5. Important technical decisions and constraints

- **v4.1 is authoritative** for current Evaluations scoring; do not retune weights to restore v3.5 preferred spreads (`reports/descriptor-v4/B-before-after.md`).  
- **Rank direction:** 1 = weakest, N = strongest; 0 scores are ranked; unavailable = non-finite only.  
- **Open Volume ≠ occupancy/circulation.** Gold clearance evidence is not verified accessible space. Exposed tops / roof lids are excluded from OV interior credit.  
- **Levels:** uncovered decks and perimeter branches can count as levels even without stairs; roof caps over lower floors do not.  
- **Official 15 OBJs stay outside the repo**; registry reads from disk. This checkout uses Ryan’s `obj files` tree (workspaces **v2/original forms**).  
- **Unit / up for registry scoring:** feet scale `1`, Y-up in `registryOpenVolume` (`analyzeMesh(..., 1, "y")`). Client Analyze uses Lattice unit/up settings—keep **feet** for comparable recorded scores.  
- **Large meshes:** uploaded geometry may not persist across refresh (`geometryPersisted` warning).  
- **Do not commit secrets**; OBJ corpus paths are local. Prefer not force-pushing shared branches.

---

## 6. Next recommended development steps

1. **Preserve local work** — Review `git diff` on the 7 Evaluations/registry files; commit on `feature/descriptor-comparison-clean` (or a side branch) if the session-rank + local path + 1284×494 export behavior should persist.  
2. **Smoke-test Evaluations** — Load forms from `obj files` (or samples), **Analyze All Forms**, confirm session ranks appear for Sequential/Open Volume least–most, then **Export 3D PNG** at **1284 × 494**.  
3. **Configurablize registry path** — Replace hardcoded `REGISTRY_DIRECTORY` with `process.env` or a small local config ignored by git.  
4. **UX pass on exports** — Label Export PNG as “section board” and Export 3D PNG as “current view,” or make Export PNG respect the active view.  
5. **Optional:** Session vs registry rank toggle if both cohort types are still needed for studio reviews.  
6. When integrating upstream, pull `origin/feature/descriptor-comparison-clean` and reconcile path constants (upstream still expects DHale’s Codex tree).

### Quick start for a new agent

```text
cd "C:\design 7\assignment 2\Cursor-App"
git status   # expect feature/descriptor-comparison-clean + local M files
npm run dev  # http://localhost:3000/evaluations
```

Primary touch area for continuing this thread’s work: `src/components/evaluations/**` and `src/server/registryOpenVolume.ts`.
