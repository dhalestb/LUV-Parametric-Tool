# Inserted Horizontal Plate — direct perimeter joints

Branch: `experiment/gathering-envelope`. The typology option is **Inserted Horizontal Plate**, without a letter-count suffix. The current edge-connected generator accepts editable quantities; the 12-letter fixture is a reproducible example, not a quantity limit. Historical comparison modes retain their documented restrictions.

From a clean checkout:

```powershell
npm ci
node scripts/b-to-a-joint-regression.cjs
npm run dev -- --hostname 127.0.0.1 --port 4222
```

Open http://127.0.0.1:4222/amphitheater. To recreate the exact approved study through the running app:

```powershell
$body = Get-Content proof/fixtures/inserted-plate-direct-joints-12.json -Raw
$study = Invoke-RestMethod http://127.0.0.1:4222/api/amphitheater -Method Post -ContentType 'application/json' -Body $body
Start-Process "http://127.0.0.1:4222/amphitheater?study=$($study.id)"
```

Choose **C — Architecture Only** to inspect the seams without source letters. B retains the exact original letter transforms for comparison. Select the articulated result, rather than the optional pre-articulation primary comparison.

The neighboring curved U panel continues in its original sweep direction past the near V flank to meet the retained far exterior V wall. The redundant near-flank V strip is removed. No fold, filler, bridge, source repositioning, or source scaling is introduced. Each retained V wall also meets the adjoining L wall. Missing geometric receivers reject generation.

The floor-landing helper simplifies Boolean section slivers by 0.00001 ft before its existing 0.75-ft inset. It rejects simplification area changes above 0.0001 square feet. Existing landing and mesh thresholds remain unchanged.

The portable regression generates actual geometry, checks source preservation, six joints at 19 heights each, unchanged V-wall directions, removal of redundant V strips, one connected solid, field containment, level plates, and the exact typology option name. It invokes the existing exported-mesh validation and writes Architecture Only plan/isometric evidence under `proof/interactive-check/b-to-a-joint/` (ignored generated output).

Scope: validated with this 40 x 40 x 40 ft / 9-ft / 12-letter study. This does not establish successful generation for every composition. The middle-level plan cut has an opening on the opposite U/L side at that elevation; the corrected V corner is joined. Structural performance and occupancy are not certified. Composition, Presentation and production branches are not changed by this patch.
