# Architectural level audit — 15 original OBJs

Geometric examination of the original meshes. Original OBJ vertices, faces, and topology were not modified.

Three classifications are kept separate:

1. **Existing architectural levels** — occupiable or potentially occupiable floor clusters (≥ 16 ft²), including uncovered decks and perimeter branches. Roof caps are excluded. An elevated level is counted even when no internal stair or ramp exists.
2. **Potential future inter-form connections** — upper-level perimeter openings and projecting branches. These are connection opportunities, not verified walkable routes.
3. **Existing geometrically verified circulation** — walk/step chains that actually join neighbouring samples. Potential links are never credited as stairs.

Forms audited: 15.

## Level counts

| Form | Levels | Elevations (ft) | Interior regions | Branches (upper / independent) | Verified links | Potential links | Disconnected | Lowest entries | Upper interfaces | Uncertain ft² | Below-level interior ft² |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Gathering Linear.obj | 4 | 1.3, 6.4, 13.0, 18.7 | 9 | 20 (16 / 0) | 0 | 3 | 0 | 22 | 172 | 93 | 0 |
| Gathering Void Field.obj | 1 | 10.0 | 4 | 1 (0 / 0) | 0 | 0 | 0 | 89 | 0 | 56 | 0 |
| Gathering, Plate.obj | 1 | 11.7 | 3 | 1 (0 / 0) | 0 | 0 | 0 | 92 | 0 | 29 | 1 |
| Gathering, Room within Volume.obj | 1 | 1.1 | 1 | 3 (1 / 1) | 0 | 0 | 0 | 23 | 1 | 69 | 0 |
| Gathering, Stepped.obj | 3 | 2.1, 10.4, 18.6 | 3 | 3 (2 / 0) | 0 | 2 | 0 | 52 | 100 | 2 | 0 |
| Lobby Continuous Hall.obj | 1 | 18.9 | 1 | 1 (0 / 0) | 0 | 0 | 0 | 22 | 0 | 0 | 8 |
| Lobby Vertical Void.obj | 3 | 1.7, 8.4, 20.3 | 2 | 5 (2 / 0) | 0 | 2 | 0 | 16 | 31 | 10 | 0 |
| Lobby, Ground Field.obj | 3 | 3.4, 9.5, 17.2 | 10 | 10 (6 / 0) | 0 | 2 | 0 | 28 | 80 | 71 | 0 |
| Lobby, Linear.obj | 3 | 6.3, 13.0, 19.8 | 4 | 5 (3 / 0) | 0 | 2 | 0 | 25 | 62 | 24 | 0 |
| Lobby, Sequential.obj | 4 | 2.3, 7.1, 13.9, 19.9 | 5 | 11 (9 / 0) | 0 | 3 | 0 | 11 | 89 | 54 | 0 |
| workspace cascaded.obj | 1 | 10.7 | 16 | 1 (0 / 0) | 0 | 0 | 0 | 120 | 0 | 46 | 0 |
| workspace flat deep-plate.obj | 3 | 1.2, 10.5, 19.9 | 3 | 3 (2 / 0) | 0 | 2 | 0 | 39 | 75 | 9 | 0 |
| workspace open hall.obj | 3 | 0.8, 10.0, 19.1 | 3 | 3 (2 / 0) | 0 | 2 | 0 | 26 | 47 | 59 | 0 |
| workspace undulating.obj | 3 | 2.5, 10.2, 18.2 | 3 | 3 (2 / 0) | 0 | 2 | 0 | 35 | 72 | 32 | 0 |
| workspace void.obj | 2 | 2.4, 15.1 | 3 | 6 (4 / 3) | 0 | 1 | 0 | 21 | 11 | 25 | 9 |

## Per-form notes

### Gathering Linear.obj

Bounds 20.0 × 20.0 × 20.0 ft. 20865 vertices, 41604 faces, 41604 triangles.

- Level 0: elevation 1.34 ft, 45 ft² total, 45 ft² interior, 0 ft² uncovered deck.
- Level 1: elevation 6.40 ft, 116 ft² total, 111 ft² interior, 5 ft² uncovered deck.
- Level 2: elevation 12.97 ft, 136 ft² total, 105 ft² interior, 31 ft² uncovered deck.
- Level 3: elevation 18.73 ft, 145 ft² total, 0 ft² interior, 145 ft² uncovered deck.
- Perimeter branch 0 on level 0 at 1.3 ft, 5 ft², lowest-level interface, 1 tips.
- Perimeter branch 1 on level 0 at 1.3 ft, 30 ft², lowest-level interface, 5 tips.
- Perimeter branch 2 on level 0 at 1.3 ft, 6 ft², lowest-level interface, 4 tips.
- Perimeter branch 3 on level 0 at 1.3 ft, 4 ft², lowest-level interface, 2 tips.
- Perimeter branch 4 on level 1 at 6.4 ft, 11 ft², upper-level interface, 3 tips.
- Perimeter branch 5 on level 1 at 6.4 ft, 12 ft², upper-level interface, 1 tips.
- Perimeter branch 6 on level 1 at 6.4 ft, 15 ft², upper-level interface, 2 tips.
- Perimeter branch 7 on level 1 at 6.4 ft, 49 ft², upper-level interface, 3 tips.
- Perimeter branch 8 on level 1 at 6.4 ft, 18 ft², upper-level interface, 1 tips.
- Perimeter branch 9 on level 1 at 6.4 ft, 6 ft², upper-level interface, 4 tips.
- Perimeter branch 10 on level 2 at 13.0 ft, 41 ft², upper-level interface, 4 tips.
- Perimeter branch 11 on level 2 at 13.0 ft, 64 ft², upper-level interface, 2 tips.
- Perimeter branch 12 on level 2 at 13.0 ft, 14 ft², upper-level interface, 2 tips.
- Perimeter branch 13 on level 2 at 13.0 ft, 6 ft², upper-level interface, 4 tips.
- Perimeter branch 14 on level 2 at 13.0 ft, 11 ft², upper-level interface, 1 tips.
- Perimeter branch 15 on level 3 at 18.7 ft, 49 ft², upper-level interface, 2 tips.
- Perimeter branch 16 on level 3 at 18.7 ft, 45 ft², upper-level interface, 4 tips.
- Perimeter branch 17 on level 3 at 18.7 ft, 8 ft², upper-level interface, 4 tips.
- Perimeter branch 18 on level 3 at 18.7 ft, 30 ft², upper-level interface, 1 tips.
- Perimeter branch 19 on level 3 at 18.7 ft, 13 ft², upper-level interface, 4 tips.
- Potential (unverified) level adjacency: level 0 → 1. Not a stair.
- Potential (unverified) level adjacency: level 1 → 2. Not a stair.
- Potential (unverified) level adjacency: level 2 → 3. Not a stair.
- 172 upper-level perimeter opening(s) recorded as potential external connection interfaces.
- Uncertain: 93 ft² of floor has enclosure 0.25–0.5 and is reported, not credited as interior volume.

### Gathering Void Field.obj

Bounds 20.0 × 20.0 × 20.2 ft. 3611 vertices, 7138 faces, 7138 triangles.

- Level 0: elevation 10.01 ft, 301 ft² total, 143 ft² interior, 158 ft² uncovered deck.
- Perimeter branch 0 on level 0 at 10.0 ft, 168 ft², lowest-level interface, 4 tips.
- Uncertain: 56 ft² of floor has enclosure 0.25–0.5 and is reported, not credited as interior volume.

### Gathering, Plate.obj

Bounds 20.0 × 20.0 × 20.0 ft. 4044 vertices, 7924 faces, 7924 triangles.

- Level 0: elevation 11.75 ft, 243 ft² total, 132 ft² interior, 111 ft² uncovered deck.
- Perimeter branch 0 on level 0 at 11.7 ft, 230 ft², lowest-level interface, 23 tips.
- Uncertain: 29 ft² of floor has enclosure 0.25–0.5 and is reported, not credited as interior volume.

### Gathering, Room within Volume.obj

Bounds 21.4 × 20.0 × 20.0 ft. 15009 vertices, 29854 faces, 29854 triangles.

- Level 0: elevation 1.11 ft, 266 ft² total, 226 ft² interior, 40 ft² uncovered deck.
- Perimeter branch 0 on level 0 at 1.1 ft, 166 ft², lowest-level interface, 6 tips.
- Perimeter branch 1 on level 0 at 1.1 ft, 5 ft², lowest-level interface, 1 tips.
- Perimeter branch 2 on no counted level at 10.2 ft, 7 ft², independent connection interface (not a floor), 1 tips.
- 1 upper-level perimeter opening(s) recorded as potential external connection interfaces.
- Uncertain: 69 ft² of floor has enclosure 0.25–0.5 and is reported, not credited as interior volume.
- Uncertain: 151 ft² of uncovered samples classified as roof caps, not occupiable levels.

### Gathering, Stepped.obj

Bounds 20.0 × 20.0 × 20.0 ft. 12783 vertices, 21602 faces, 21593 triangles.

- Level 0: elevation 2.05 ft, 138 ft² total, 81 ft² interior, 57 ft² uncovered deck.
- Level 1: elevation 10.43 ft, 136 ft² total, 65 ft² interior, 71 ft² uncovered deck.
- Level 2: elevation 18.59 ft, 138 ft² total, 0 ft² interior, 138 ft² uncovered deck.
- Perimeter branch 0 on level 0 at 2.1 ft, 129 ft², lowest-level interface, 9 tips.
- Perimeter branch 1 on level 1 at 10.4 ft, 128 ft², upper-level interface, 9 tips.
- Perimeter branch 2 on level 2 at 18.6 ft, 129 ft², upper-level interface, 9 tips.
- Potential (unverified) level adjacency: level 0 → 1. Not a stair.
- Potential (unverified) level adjacency: level 1 → 2. Not a stair.
- 100 upper-level perimeter opening(s) recorded as potential external connection interfaces.

### Lobby Continuous Hall.obj

Bounds 20.6 × 20.0 × 20.7 ft. 2110 vertices, 4152 faces, 4152 triangles.

- Level 0: elevation 18.89 ft, 135 ft² total, 0 ft² interior, 135 ft² uncovered deck.
- Perimeter branch 0 on level 0 at 18.9 ft, 92 ft², lowest-level interface, 5 tips.

### Lobby Vertical Void.obj

Bounds 20.0 × 20.0 × 20.7 ft. 14354 vertices, 28576 faces, 28576 triangles.

- Level 0: elevation 1.69 ft, 35 ft² total, 26 ft² interior, 9 ft² uncovered deck.
- Level 1: elevation 8.36 ft, 205 ft² total, 200 ft² interior, 5 ft² uncovered deck.
- Level 2: elevation 20.34 ft, 224 ft² total, 0 ft² interior, 224 ft² uncovered deck.
- Perimeter branch 0 on level 0 at 1.7 ft, 13 ft², lowest-level interface, 2 tips.
- Perimeter branch 1 on level 0 at 1.7 ft, 15 ft², lowest-level interface, 2 tips.
- Perimeter branch 2 on level 0 at 1.7 ft, 5 ft², lowest-level interface, 1 tips.
- Perimeter branch 3 on level 1 at 8.4 ft, 153 ft², upper-level interface, 4 tips.
- Perimeter branch 4 on level 2 at 20.3 ft, 147 ft², upper-level interface, 4 tips.
- Potential (unverified) level adjacency: level 0 → 1. Not a stair.
- Potential (unverified) level adjacency: level 1 → 2. Not a stair.
- 31 upper-level perimeter opening(s) recorded as potential external connection interfaces.

### Lobby, Ground Field.obj

Bounds 20.0 × 20.0 × 20.0 ft. 7017 vertices, 11634 faces, 11634 triangles.

- Level 0: elevation 3.43 ft, 131 ft² total, 126 ft² interior, 5 ft² uncovered deck.
- Level 1: elevation 9.50 ft, 143 ft² total, 121 ft² interior, 22 ft² uncovered deck.
- Level 2: elevation 17.16 ft, 183 ft² total, 0 ft² interior, 183 ft² uncovered deck.
- Perimeter branch 0 on level 0 at 3.4 ft, 38 ft², lowest-level interface, 1 tips.
- Perimeter branch 1 on level 0 at 3.4 ft, 75 ft², lowest-level interface, 1 tips.
- Perimeter branch 2 on level 0 at 3.4 ft, 5 ft², lowest-level interface, 2 tips.
- Perimeter branch 3 on level 0 at 3.4 ft, 7 ft², lowest-level interface, 2 tips.
- Perimeter branch 4 on level 1 at 9.5 ft, 43 ft², upper-level interface, 3 tips.
- Perimeter branch 5 on level 1 at 9.5 ft, 79 ft², upper-level interface, 3 tips.
- Perimeter branch 6 on level 1 at 9.5 ft, 5 ft², upper-level interface, 2 tips.
- Perimeter branch 7 on level 1 at 9.5 ft, 7 ft², upper-level interface, 2 tips.
- Perimeter branch 8 on level 2 at 17.2 ft, 151 ft², upper-level interface, 4 tips.
- Perimeter branch 9 on level 2 at 17.2 ft, 7 ft², upper-level interface, 2 tips.
- Potential (unverified) level adjacency: level 0 → 1. Not a stair.
- Potential (unverified) level adjacency: level 1 → 2. Not a stair.
- 80 upper-level perimeter opening(s) recorded as potential external connection interfaces.
- Uncertain: 71 ft² of floor has enclosure 0.25–0.5 and is reported, not credited as interior volume.

### Lobby, Linear.obj

Bounds 20.0 × 20.0 × 20.0 ft. 6220 vertices, 12266 faces, 12266 triangles.

- Level 0: elevation 6.33 ft, 52 ft² total, 52 ft² interior, 0 ft² uncovered deck.
- Level 1: elevation 13.00 ft, 52 ft² total, 51 ft² interior, 1 ft² uncovered deck.
- Level 2: elevation 19.79 ft, 97 ft² total, 0 ft² interior, 97 ft² uncovered deck.
- Perimeter branch 0 on level 0 at 6.3 ft, 39 ft², lowest-level interface, 5 tips.
- Perimeter branch 1 on level 0 at 6.3 ft, 5 ft², lowest-level interface, 1 tips.
- Perimeter branch 2 on level 1 at 13.0 ft, 39 ft², upper-level interface, 5 tips.
- Perimeter branch 3 on level 1 at 13.0 ft, 5 ft², upper-level interface, 1 tips.
- Perimeter branch 4 on level 2 at 19.8 ft, 88 ft², upper-level interface, 7 tips.
- Potential (unverified) level adjacency: level 0 → 1. Not a stair.
- Potential (unverified) level adjacency: level 1 → 2. Not a stair.
- 62 upper-level perimeter opening(s) recorded as potential external connection interfaces.
- Uncertain: 24 ft² of floor has enclosure 0.25–0.5 and is reported, not credited as interior volume.

### Lobby, Sequential.obj

Bounds 20.3 × 21.6 × 20.0 ft. 7496 vertices, 14911 faces, 14911 triangles.

- Level 0: elevation 2.26 ft, 21 ft² total, 21 ft² interior, 0 ft² uncovered deck.
- Level 1: elevation 7.13 ft, 84 ft² total, 83 ft² interior, 1 ft² uncovered deck.
- Level 2: elevation 13.86 ft, 81 ft² total, 81 ft² interior, 0 ft² uncovered deck.
- Level 3: elevation 19.88 ft, 108 ft² total, 0 ft² interior, 108 ft² uncovered deck.
- Perimeter branch 0 on level 0 at 2.3 ft, 7 ft², lowest-level interface, 2 tips.
- Perimeter branch 1 on level 0 at 2.3 ft, 14 ft², lowest-level interface, 1 tips.
- Perimeter branch 2 on level 1 at 7.1 ft, 33 ft², upper-level interface, 3 tips.
- Perimeter branch 3 on level 1 at 7.1 ft, 14 ft², upper-level interface, 3 tips.
- Perimeter branch 4 on level 1 at 7.1 ft, 23 ft², upper-level interface, 1 tips.
- Perimeter branch 5 on level 1 at 7.1 ft, 8 ft², upper-level interface, 3 tips.
- Perimeter branch 6 on level 2 at 13.9 ft, 25 ft², upper-level interface, 3 tips.
- Perimeter branch 7 on level 2 at 13.9 ft, 23 ft², upper-level interface, 7 tips.
- Perimeter branch 8 on level 2 at 13.9 ft, 8 ft², upper-level interface, 1 tips.
- Perimeter branch 9 on level 2 at 13.9 ft, 25 ft², upper-level interface, 3 tips.
- Perimeter branch 10 on level 3 at 19.9 ft, 107 ft², upper-level interface, 7 tips.
- Potential (unverified) level adjacency: level 0 → 1. Not a stair.
- Potential (unverified) level adjacency: level 1 → 2. Not a stair.
- Potential (unverified) level adjacency: level 2 → 3. Not a stair.
- 89 upper-level perimeter opening(s) recorded as potential external connection interfaces.
- Uncertain: 54 ft² of floor has enclosure 0.25–0.5 and is reported, not credited as interior volume.

### workspace cascaded.obj

Bounds 20.0 × 20.0 × 20.0 ft. 7311 vertices, 13331 faces, 13164 triangles.

- Level 0: elevation 10.71 ft, 494 ft² total, 270 ft² interior, 224 ft² uncovered deck.
- Perimeter branch 0 on level 0 at 10.7 ft, 244 ft², lowest-level interface, 1 tips.
- Uncertain: 46 ft² of floor has enclosure 0.25–0.5 and is reported, not credited as interior volume.

### workspace flat deep-plate.obj

Bounds 20.0 × 20.0 × 20.0 ft. 25374 vertices, 45806 faces, 46131 triangles.

- Level 0: elevation 1.18 ft, 197 ft² total, 173 ft² interior, 24 ft² uncovered deck.
- Level 1: elevation 10.53 ft, 197 ft² total, 162 ft² interior, 35 ft² uncovered deck.
- Level 2: elevation 19.88 ft, 197 ft² total, 0 ft² interior, 197 ft² uncovered deck.
- Perimeter branch 0 on level 0 at 1.2 ft, 178 ft², lowest-level interface, 1 tips.
- Perimeter branch 1 on level 1 at 10.5 ft, 178 ft², upper-level interface, 1 tips.
- Perimeter branch 2 on level 2 at 19.9 ft, 178 ft², upper-level interface, 1 tips.
- Potential (unverified) level adjacency: level 0 → 1. Not a stair.
- Potential (unverified) level adjacency: level 1 → 2. Not a stair.
- 75 upper-level perimeter opening(s) recorded as potential external connection interfaces.

### workspace open hall.obj

Bounds 20.0 × 20.0 × 20.0 ft. 4727 vertices, 8091 faces, 8169 triangles.

- Level 0: elevation 0.85 ft, 124 ft² total, 83 ft² interior, 41 ft² uncovered deck.
- Level 1: elevation 10.02 ft, 112 ft² total, 58 ft² interior, 54 ft² uncovered deck.
- Level 2: elevation 19.10 ft, 113 ft² total, 0 ft² interior, 113 ft² uncovered deck.
- Perimeter branch 0 on level 0 at 0.8 ft, 102 ft², lowest-level interface, 5 tips.
- Perimeter branch 1 on level 1 at 10.0 ft, 101 ft², upper-level interface, 5 tips.
- Perimeter branch 2 on level 2 at 19.1 ft, 101 ft², upper-level interface, 5 tips.
- Potential (unverified) level adjacency: level 0 → 1. Not a stair.
- Potential (unverified) level adjacency: level 1 → 2. Not a stair.
- 47 upper-level perimeter opening(s) recorded as potential external connection interfaces.
- Uncertain: 59 ft² of floor has enclosure 0.25–0.5 and is reported, not credited as interior volume.

### workspace undulating.obj

Bounds 20.0 × 20.0 × 20.0 ft. 8802 vertices, 15487 faces, 15393 triangles.

- Level 0: elevation 2.51 ft, 170 ft² total, 123 ft² interior, 47 ft² uncovered deck.
- Level 1: elevation 10.25 ft, 170 ft² total, 117 ft² interior, 53 ft² uncovered deck.
- Level 2: elevation 18.24 ft, 210 ft² total, 0 ft² interior, 210 ft² uncovered deck.
- Perimeter branch 0 on level 0 at 2.5 ft, 133 ft², lowest-level interface, 2 tips.
- Perimeter branch 1 on level 1 at 10.2 ft, 133 ft², upper-level interface, 2 tips.
- Perimeter branch 2 on level 2 at 18.2 ft, 147 ft², upper-level interface, 4 tips.
- Potential (unverified) level adjacency: level 0 → 1. Not a stair.
- Potential (unverified) level adjacency: level 1 → 2. Not a stair.
- 72 upper-level perimeter opening(s) recorded as potential external connection interfaces.
- Uncertain: 32 ft² of floor has enclosure 0.25–0.5 and is reported, not credited as interior volume.

### workspace void.obj

Bounds 20.0 × 20.0 × 20.0 ft. 3972 vertices, 5890 faces, 6129 triangles.

- Level 0: elevation 2.37 ft, 50 ft² total, 23 ft² interior, 27 ft² uncovered deck.
- Level 1: elevation 15.10 ft, 21 ft² total, 0 ft² interior, 21 ft² uncovered deck.
- Perimeter branch 0 on level 0 at 2.4 ft, 20 ft², lowest-level interface, 3 tips.
- Perimeter branch 1 on level 0 at 2.4 ft, 26 ft², lowest-level interface, 3 tips.
- Perimeter branch 2 on level 1 at 15.1 ft, 18 ft², upper-level interface, 1 tips.
- Perimeter branch 3 on no counted level at 6.6 ft, 9 ft², independent connection interface (not a floor), 2 tips.
- Perimeter branch 4 on no counted level at 11.0 ft, 6 ft², independent connection interface (not a floor), 2 tips.
- Perimeter branch 5 on no counted level at 19.8 ft, 13 ft², independent connection interface (not a floor), 1 tips.
- Potential (unverified) level adjacency: level 0 → 1. Not a stair.
- 11 upper-level perimeter opening(s) recorded as potential external connection interfaces.
- Uncertain: 25 ft² of floor has enclosure 0.25–0.5 and is reported, not credited as interior volume.

## Interpretation

Single-level forms: Gathering Void Field.obj; Gathering, Plate.obj; Gathering, Room within Volume.obj; Lobby Continuous Hall.obj; workspace cascaded.obj.
Forms with three or more levels: Gathering Linear.obj (4); Gathering, Stepped.obj (3); Lobby Vertical Void.obj (3); Lobby, Ground Field.obj (3); Lobby, Linear.obj (3); Lobby, Sequential.obj (4); workspace flat deep-plate.obj (3); workspace open hall.obj (3); workspace undulating.obj (3).

Upper levels without an internal stair remain levels. Their perimeter openings remain potential interfaces. They are not credited as verified circulation.

## Descriptor ranking completeness

| Descriptor | Ranked forms | Processing failures |
|---|---:|---:|
| openVolume | 15 | 0 |
| convergent | 15 | 0 |
| sculptural | 15 | 0 |
| visuallyConnected | 15 | 0 |
| surreal | 15 | 0 |
| monumental | 15 | 0 |
| hierarchical | 15 | 0 |
| sequential | 15 | 0 |
| circulationActivated | 15 | 0 |
| centralized | 15 | 0 |
| verticallyIntegrated | 15 | 0 |
| luminous | 15 | 0 |

Every finite score, including 0, is ranked 1…n in the same 15-form group. Ties use filename after score. A processing failure is `n/a`, not 0.

## v4.1 scores (0–100)

| Form | openVolume | convergent | sculptural | visuallyConnected | surreal | monumental | hierarchical | sequential | circulationActivated | centralized | verticallyIntegrated | luminous |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Gathering Linear.obj | 11.6 | 3.2 | 45.8 | 63.3 | 46.1 | 25.2 | 23.4 | 6.3 | 33.7 | 47.5 | 30.6 | 64.9 |
| Gathering Void Field.obj | 9.5 | 55.7 | 66.4 | 63.1 | 71.6 | 25.7 | 11.7 | 6.3 | 45.5 | 41.0 | 0.0 | 70.9 |
| Gathering, Plate.obj | 12.1 | 68.9 | 56.9 | 65.7 | 73.3 | 23.3 | 28.7 | 6.3 | 50.2 | 39.5 | 0.0 | 68.3 |
| Gathering, Room within Volume.obj | 33.0 | 95.1 | 51.3 | 41.4 | 38.4 | 33.3 | 0.0 | 6.3 | 78.7 | 34.3 | 0.0 | 69.9 |
| Gathering, Stepped.obj | 13.7 | 11.2 | 65.4 | 46.6 | 70.3 | 25.8 | 15.4 | 6.3 | 51.7 | 44.1 | 19.0 | 78.0 |
| Lobby Continuous Hall.obj | 1.6 | 98.9 | 64.2 | 0.0 | 63.5 | 26.0 | 0.0 | 6.3 | 79.4 | 59.7 | 0.0 | 0.0 |
| Lobby Vertical Void.obj | 17.0 | 15.0 | 46.1 | 45.2 | 22.7 | 26.2 | 42.0 | 0.0 | 53.1 | 26.0 | 21.4 | 78.5 |
| Lobby, Ground Field.obj | 10.6 | 14.6 | 52.0 | 46.5 | 56.5 | 24.1 | 26.8 | 6.3 | 64.5 | 43.4 | 33.7 | 63.5 |
| Lobby, Linear.obj | 9.2 | 15.0 | 51.2 | 33.5 | 50.0 | 23.0 | 36.8 | 6.3 | 56.8 | 47.9 | 30.7 | 77.8 |
| Lobby, Sequential.obj | 9.3 | 11.8 | 53.4 | 20.1 | 63.2 | 20.7 | 27.9 | 0.0 | 38.2 | 47.0 | 27.2 | 53.3 |
| workspace cascaded.obj | 12.9 | 54.9 | 51.0 | 27.3 | 51.9 | 28.4 | 8.4 | 6.3 | 41.1 | 36.4 | 0.0 | 40.3 |
| workspace flat deep-plate.obj | 24.2 | 6.6 | 51.6 | 48.9 | 34.8 | 26.6 | 15.0 | 6.3 | 52.8 | 45.2 | 28.0 | 77.6 |
| workspace open hall.obj | 20.7 | 12.0 | 64.9 | 38.1 | 56.5 | 26.3 | 19.0 | 6.3 | 50.9 | 41.3 | 22.3 | 60.9 |
| workspace undulating.obj | 9.5 | 14.1 | 54.8 | 29.0 | 50.7 | 27.0 | 23.3 | 6.3 | 52.8 | 49.8 | 16.7 | 67.0 |
| workspace void.obj | 4.9 | 60.7 | 66.0 | 43.3 | 37.2 | 24.8 | 46.7 | 0.0 | 50.4 | 7.0 | 20.0 | 58.7 |

## v4.1 ranks (1 weakest … 15 strongest)

| Form | openVolume | convergent | sculptural | visuallyConnected | surreal | monumental | hierarchical | sequential | circulationActivated | centralized | verticallyIntegrated | luminous |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Gathering Linear.obj | 8 | 1 | 1 | 14 | 5 | 6 | 9 | 4 | 1 | 12 | 13 | 7 |
| Gathering Void Field.obj | 5 | 11 | 15 | 13 | 14 | 7 | 4 | 5 | 4 | 6 | 1 | 11 |
| Gathering, Plate.obj | 9 | 13 | 10 | 15 | 15 | 3 | 12 | 6 | 5 | 5 | 2 | 9 |
| Gathering, Room within Volume.obj | 15 | 14 | 5 | 7 | 4 | 15 | 1 | 7 | 14 | 3 | 3 | 10 |
| Gathering, Stepped.obj | 11 | 3 | 13 | 11 | 13 | 8 | 6 | 8 | 8 | 9 | 7 | 14 |
| Lobby Continuous Hall.obj | 1 | 15 | 11 | 1 | 12 | 9 | 2 | 9 | 15 | 15 | 4 | 1 |
| Lobby Vertical Void.obj | 12 | 8 | 2 | 9 | 1 | 10 | 14 | 1 | 11 | 2 | 9 | 15 |
| Lobby, Ground Field.obj | 7 | 7 | 7 | 10 | 10 | 4 | 10 | 10 | 13 | 8 | 15 | 6 |
| Lobby, Linear.obj | 3 | 9 | 4 | 5 | 6 | 2 | 13 | 11 | 12 | 13 | 14 | 13 |
| Lobby, Sequential.obj | 4 | 4 | 8 | 2 | 11 | 1 | 11 | 2 | 2 | 11 | 11 | 3 |
| workspace cascaded.obj | 10 | 10 | 3 | 3 | 8 | 14 | 3 | 12 | 3 | 4 | 5 | 2 |
| workspace flat deep-plate.obj | 14 | 2 | 6 | 12 | 2 | 12 | 5 | 13 | 10 | 10 | 12 | 12 |
| workspace open hall.obj | 13 | 5 | 12 | 6 | 9 | 11 | 7 | 14 | 7 | 7 | 10 | 5 |
| workspace undulating.obj | 6 | 6 | 9 | 4 | 7 | 13 | 8 | 15 | 9 | 14 | 6 | 8 |
| workspace void.obj | 2 | 12 | 14 | 8 | 3 | 5 | 15 | 3 | 6 | 1 | 8 | 4 |

Gathering — Room within Volume has 1 counted interior level(s) and a finite score for 12 of 12 descriptors. No descriptor was skipped because of floor count.

## Review notes

- Room within Volume is one interior level at 1.1 ft. Void Field, Plate, Continuous Hall, and workspace cascaded are also single-level under the 1.5 ft / 16 ft² rules.
- Its roof (151 ft²) is a roof cap. A 7 ft² surface at 10.2 ft is an independent connection interface, not a second floor. No verified stair exists.
- Compact plates report one large perimeter band (Plate: 230 ft² of a 243 ft² level). That is the eroded edge, not a separate finger. Review it before treating the band as a distinct branch.
- Interfaces below 16 ft² are kept when they project: Room within Volume 7 ft² at 10.2 ft; workspace void 9 ft² at 6.6 ft, 6 ft² at 11.0 ft, and 13 ft² at 19.8 ft.
- No form has a verified walk/step chain between levels. Potential links are plan adjacencies only.
- Continuous Hall’s only detected surface is an uncovered deck at 18.9 ft, with 8 ft² of sheltered floor below the level threshold. Visually Connected and Luminous are 0.
- Several top levels are uncovered decks near the mesh top. They are counted because they are not column-lids over a sheltered floor.
- Tied scores (Sequential 6.3, Vertically Integrated 0) keep their score. Rank order among a tie follows filename.
- workspace cascaded stays one level because its plates fall inside one 1.5 ft cluster. Sixteen regions record the plan breakup.
- Luminous ignores uncertain enclosure. A sealed test hall still leaks about 5.5 points where rays graze quad edges. That is a measured leak, not a processing failure.
