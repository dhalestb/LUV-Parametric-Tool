# Architectural Forms

Dedicated workflow imported from `dhalestb/LUV-Parametric-Tool`, branch
`architectural-space-generation`, commit `25dd181c9930ec9601b359804df15bd06b37c2e4`
(November 12, 2026, 1:48 p.m. Eastern).

The `/architectural-forms` page contains generation, editing, the generated-form
repository, module modification, and exports. Its presentation page is at
`/architectural-forms/presentation`. Geometry and board backup handlers are under
`/api/architectural-forms`.

The imported geometry modules are kept together so the existing Composition and
Gathering workflows retain their versions. Navigation, Slide state, board mode,
and viewport providers are shared. The optimizer session and saved configurations
use separate Architectural Forms storage keys. The obsolete descriptor-target
panel is omitted, matching the user's requested interface.

Local correction: moduleWorkflow must apply X/Y changes even when the Z module
range is unchanged. Run `node scripts/architectural-forms-module-regression.cjs`
to check the transformation of geometry, area, volume, and connection endpoints.

Generated forms are saved in this browser, one per typology. Presentation boards
use the imported board storage and explicit GitHub backup controls.
