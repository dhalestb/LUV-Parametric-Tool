# Original four-form regression fixture

Run `node scripts/restore-lattice-fixture.cjs` from the repository root before the original-OBJ regression scripts. This restores the ignored `checkpoints/lattice-session.json` byte for byte, verifies both archive and original hashes, and refuses to overwrite a differing checkpoint. No dependencies are installed.

The preserved session uses the original O2, O1, G1 and L1 meshes. Fixed regression placements are O2 (0,0,0)/variant 0, O1 (1,0,0)/variant 2, G1 (1,1,0)/variant 0 and L1 (2,1,0)/variant 3 in a 4 × 4 × 1 lattice with 20-foot registration. These are diagnostic inputs, not a successful assembly claim.

Stage 2D's original `results.json` is separately archived as `reports/stage2d-adaptive-connectors/results.json.gz`, with a SHA-256 manifest. Decompression recovers the exact historical evidence; the uncompressed local original is retained.
