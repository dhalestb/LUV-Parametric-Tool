import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OFFICE_TYPOLOGIES,
  arrangeOfficeLetters,
  buildOpenHallGuideLetters,
  officePlanReady,
  planOfficeWorkspace,
  type OfficeCheck,
} from "./officeWorkspaceRules";
import {
  sectionsForTypology,
  summarizeWorkspaceChecks,
  WORKSPACE_RULE_SECTIONS,
} from "./workspaceRulesetCatalog";
import { WORKSPACE_DEFAULT_FIELDS } from "./workspaceDualRulesets";

describe("workspace dual-ruleset catalog", () => {
  it("defines exactly ten typology-specific letter/architecture sections", () => {
    assert.equal(WORKSPACE_RULE_SECTIONS.length, 10);
    for (const typology of OFFICE_TYPOLOGIES) {
      const pair = sectionsForTypology(typology);
      assert.equal(pair.length, 2, typology);
      assert.deepEqual(pair.map((section) => section.stage).sort(), [
        "architectural-generation",
        "letter-arrangement",
      ]);
    }
  });
});

describe("office reference ruleset", () => {
  const center: [number, number, number] = [0, 0, 0];

  for (const typology of OFFICE_TYPOLOGIES) {
    it(`passes every measured check for ${typology}`, () => {
      const field = WORKSPACE_DEFAULT_FIELDS[typology as keyof typeof WORKSPACE_DEFAULT_FIELDS]
        ?? { width: 20, depth: 20, height: 20 };
      const plan = planOfficeWorkspace(typology, 0, center, field);
      assert.ok(officePlanReady(plan), plan.checks.filter((c) => c.status !== "pass").map((c) => `${c.label}:${c.status}`).join("; "));
      assert.equal(plan.checks.filter((c) => c.status === "fail").length, 0);
      assert.equal(plan.checks.filter((c) => c.status === "unverified").length, 0);
      for (const group of summarizeWorkspaceChecks(typology, plan.checks)) {
        if (!group.items.length) continue;
        assert.notEqual(group.status, "fail", group.section.title);
      }
    });
  }

  it("rejects non-orthogonal Open Hall footprint as fail rather than unverified", () => {
    const plan = planOfficeWorkspace("open-hall-workspace", 7, center, WORKSPACE_DEFAULT_FIELDS["open-hall-workspace"]);
    const rotation = plan.checks.find((item) => item.label === "Orthogonal footprint");
    assert.ok(rotation);
    assert.equal(rotation!.status, "fail");
    const envelope = plan.checks.find((item) => item.label === "Field envelope");
    assert.ok(envelope);
  });

  it("Open Hall invents role-grouped L guides at preset sizes", () => {
    const field = { ...WORKSPACE_DEFAULT_FIELDS["open-hall-workspace"], columnSize: 2, floorMezzGuideSize: 11, wallGuideSize: 9, roofGuideSize: 6 };
    const plan = planOfficeWorkspace("open-hall-workspace", 0, center, field);
    assert.ok(plan.slots.every((slot) => slot.prefer === "L" && slot.openHallRole));
    assert.ok(plan.slots.some((slot) => slot.openHallRole === "column" && slot.scale === 2));
    assert.ok(plan.slots.some((slot) => slot.openHallRole === "floor" && slot.scale === 11));
    assert.ok(plan.slots.some((slot) => slot.openHallRole === "mezzanine" && slot.scale === 11));
    assert.ok(plan.slots.some((slot) => slot.openHallRole === "wall" && slot.scale === 9 && Math.abs(slot.rx - 90) < 1e-6));
    assert.ok(plan.slots.some((slot) => slot.openHallRole === "roof" && slot.scale === 6));
    const guides = buildOpenHallGuideLetters(field, center);
    assert.equal(guides.length, plan.slots.length);
    assert.ok(guides.every((g) => g.letter === "L" && g.openHallRole));
  });

  it("Open Hall arrange keeps invented spaced poses (no single-slot collapse)", () => {
    const field = { ...WORKSPACE_DEFAULT_FIELDS["open-hall-workspace"], columnSize: 2, floorMezzGuideSize: 11, wallGuideSize: 9, roofGuideSize: 6 };
    const guides = buildOpenHallGuideLetters(field, center);
    const arranged = arrangeOfficeLetters(guides, "open-hall-workspace", 12, center, field);
    const floors = arranged.placements.filter((p) => p.openHallRole === "floor");
    const uniqueFloors = new Set(floors.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`));
    assert.equal(uniqueFloors.size, 4);
    const xs = arranged.placements.map((p) => p.x);
    assert.ok(Math.max(...xs) - Math.min(...xs) > 20, "arranged letters should span the hall in X");
  });

  it("Open Hall arrange snaps stale invent poses onto the current plan form", () => {
    const field = { ...WORKSPACE_DEFAULT_FIELDS["open-hall-workspace"], columnSize: 2, floorMezzGuideSize: 11, wallGuideSize: 9, roofGuideSize: 6, mezzanineFaces: 2 as const };
    const guides = buildOpenHallGuideLetters(field, center);
    // Simulate regenerate after corner seating changed: invent poses left behind.
    const stale = guides.map((g) => g.openHallRole === "mezzanine" ? { ...g, x: g.x + 4.5, y: g.y - 3.25 } : g);
    const arranged = arrangeOfficeLetters(stale, "open-hall-workspace", 12, center, field);
    const plan = arranged.officePlan!;
    for (const p of arranged.placements.filter((letter) => letter.openHallRole === "mezzanine")) {
      const slot = plan.slots.find((s) => s.openHallRole === "mezzanine" && Math.hypot(s.x - p.x, s.y - p.y, s.z - p.z) < 1e-6);
      assert.ok(slot, `mezz letter at (${p.x.toFixed(2)},${p.y.toFixed(2)}) must sit on a plan slot`);
    }
    const mezzSlots = plan.slots.filter((s) => s.openHallRole === "mezzanine");
    const seated = arranged.placements.filter((p) => p.openHallRole === "mezzanine");
    assert.equal(new Set(seated.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`)).size, mezzSlots.length);
  });

  it("Open Hall mezz Ls sit on platform exterior and interior corners", () => {
    const two = planOfficeWorkspace("open-hall-workspace", 0, center, {
      ...WORKSPACE_DEFAULT_FIELDS["open-hall-workspace"], mezzanineFaces: 2 as const, floorMezzGuideSize: 11,
    });
    const mezz = two.slots.filter((s) => s.openHallRole === "mezzanine");
    assert.equal(mezz.length, 6);
    const mezzPlate = two.plates.find((p) => p.role === "mezzanine")!;
    const xs = mezzPlate.polygon.map((p) => p[0]);
    const ys = mezzPlate.polygon.map((p) => p[1]);
    // Every mezz letter should sit near a platform corner vertex (not mid-edge).
    for (const letter of mezz) {
      const nearCorner = mezzPlate.polygon.some((v) => Math.hypot(v[0] - letter.x, v[1] - letter.y) < letter.scale * 0.75);
      assert.ok(nearCorner, `mezz L at (${letter.x.toFixed(1)},${letter.y.toFixed(1)}) should be near a platform corner`);
    }
    assert.ok(Math.max(...xs) - Math.min(...xs) > 20);
    assert.ok(Math.max(...ys) - Math.min(...ys) > 20);
    const four = planOfficeWorkspace("open-hall-workspace", 0, center, {
      ...WORKSPACE_DEFAULT_FIELDS["open-hall-workspace"], mezzanineFaces: 4 as const, floorMezzGuideSize: 11,
    });
    assert.equal(four.slots.filter((s) => s.openHallRole === "mezzanine").length, 8);
  });

  it("Open Hall floor/mezz letters invent plates from outer/inner L edges", () => {
    const field = { ...WORKSPACE_DEFAULT_FIELDS["open-hall-workspace"], columnSize: 2, floorMezzGuideSize: 11, wallGuideSize: 9, roofGuideSize: 6, mezzanineFaces: 2 as const };
    const plan = planOfficeWorkspace("open-hall-workspace", 0, center, field);
    const derived = plan.checks.find((item) => item.label === "Letter-derived plates");
    assert.equal(derived?.status, "pass", derived?.detail);
    const floors = plan.slots.filter((s) => s.openHallRole === "floor");
    const mezz = plan.slots.filter((s) => s.openHallRole === "mezzanine");
    assert.equal(floors.length, 4);
    assert.equal(mezz.length, 6);
    const ground = plan.plates.find((p) => p.role === "ground");
    assert.ok(ground);
    const box = {
      minX: Math.min(...ground!.polygon.map((p) => p[0])),
      maxX: Math.max(...ground!.polygon.map((p) => p[0])),
      minY: Math.min(...ground!.polygon.map((p) => p[1])),
      maxY: Math.max(...ground!.polygon.map((p) => p[1])),
    };
    assert.ok(box.maxX - box.minX > 20);
    assert.ok(box.maxY - box.minY > 20);
  });

  it("Open Hall column piers fill the L crook (solid pocket)", () => {
    const field = { ...WORKSPACE_DEFAULT_FIELDS["open-hall-workspace"], columnSize: 2, columnGridSpacing: 20 };
    const plan = planOfficeWorkspace("open-hall-workspace", 0, center, field);
    const piers = plan.plates.filter((p) => p.role === "support" && p.id.startsWith("column-"));
    assert.ok(piers.length >= 3);
    for (const pier of piers) {
      assert.equal(pier.polygon.length, 4, "filled pocket is a rectangle");
    }
    const grid = plan.checks.find((c) => c.label === "Column grid");
    assert.equal(grid?.status, "pass", grid?.detail);
    assert.match(grid?.detail ?? "", /filled-pocket/i);
  });

  it("Open Hall column grid uses equal XY spacing presets on the floor-plate boundary", () => {
    for (const spacing of [15, 20, 25] as const) {
      const field = { ...WORKSPACE_DEFAULT_FIELDS["open-hall-workspace"], columnGridSpacing: spacing, columnSize: 2 };
      const plan = planOfficeWorkspace("open-hall-workspace", 0, center, field);
      const grid = plan.checks.find((item) => item.label === "Column grid");
      assert.equal(grid?.status, "pass", `${spacing} ft: ${grid?.detail}`);
      assert.match(grid?.detail ?? "", new RegExp(`${spacing} ft spacing`));
      const columns = plan.slots.filter((s) => s.openHallRole === "column");
      assert.ok(columns.length >= 3);
      const xs = [...new Set(columns.map((c) => +c.x.toFixed(4)))].sort((a, b) => a - b);
      const ys = [...new Set(columns.map((c) => +c.y.toFixed(4)))].sort((a, b) => a - b);
      if (xs.length >= 2) {
        const dx = xs[1] - xs[0];
        assert.ok(Math.abs(dx - spacing) < 1e-6, `X spacing ${dx} should equal ${spacing}`);
        for (let i = 1; i < xs.length; i++) assert.ok(Math.abs(xs[i] - xs[i - 1] - dx) < 1e-6);
      }
      if (ys.length >= 2) {
        const dy = ys[1] - ys[0];
        assert.ok(Math.abs(dy - spacing) < 1e-6, `Y spacing ${dy} should equal ${spacing}`);
        for (let i = 1; i < ys.length; i++) assert.ok(Math.abs(ys[i] - ys[i - 1] - dy) < 1e-6);
      }
      const ground = plan.plates.find((p) => p.role === "ground")!;
      const minX = Math.min(...ground.polygon.map((p) => p[0]));
      const maxX = Math.max(...ground.polygon.map((p) => p[0]));
      const minY = Math.min(...ground.polygon.map((p) => p[1]));
      const maxY = Math.max(...ground.polygon.map((p) => p[1]));
      for (const c of columns) {
        assert.ok(c.x >= minX - 1e-6 && c.x <= maxX + 1e-6 && c.y >= minY - 1e-6 && c.y <= maxY + 1e-6);
      }
    }
  });

  it("Open Hall wall guide size is independent of floor/mezz and accepts custom sizes", () => {
    const field = {
      ...WORKSPACE_DEFAULT_FIELDS["open-hall-workspace"],
      columnSize: 1.5,
      floorMezzGuideSize: 13,
      wallGuideSize: 7.5,
      roofGuideSize: 4.5,
    };
    const plan = planOfficeWorkspace("open-hall-workspace", 0, center, field);
    assert.ok(plan.slots.some((slot) => slot.openHallRole === "column" && slot.scale === 1.5));
    assert.ok(plan.slots.some((slot) => slot.openHallRole === "floor" && slot.scale === 13));
    assert.ok(plan.slots.some((slot) => slot.openHallRole === "mezzanine" && slot.scale === 13));
    assert.ok(plan.slots.some((slot) => slot.openHallRole === "wall" && slot.scale === 7.5));
    assert.ok(plan.slots.some((slot) => slot.openHallRole === "roof" && slot.scale === 4.5));
    const wallSize = plan.checks.find((item) => item.label === "Wall L guides");
    const floorSize = plan.checks.find((item) => item.label === "Floor mezz guide size");
    assert.equal(wallSize?.status, "pass", wallSize?.detail);
    assert.equal(floorSize?.status, "pass", floorSize?.detail);
    assert.match(wallSize?.detail ?? "", /7\.50 ft/);
    assert.match(floorSize?.detail ?? "", /13\.00 ft/);
  });

  for (const faces of [2, 3, 4] as const) {
    it(`Open Hall mezzanine wraps ${faces} faces at ≥10 ft usable width`, () => {
      const field = { ...WORKSPACE_DEFAULT_FIELDS["open-hall-workspace"], mezzanineFaces: faces };
      const plan = planOfficeWorkspace("open-hall-workspace", 0, center, field);
      assert.ok(officePlanReady(plan), plan.checks.filter((c) => c.status !== "pass").map((c) => `${c.label}:${c.status}`).join("; "));
      const width = plan.checks.find((item) => item.label === "Mezzanine platform width");
      const opening = plan.checks.find((item) => item.label === "Mezzanine opening");
      const grid = plan.checks.find((item) => item.label === "Column grid");
      const walls = plan.checks.find((item) => item.label === "Perimeter walls and entry");
      assert.equal(width?.status, "pass", width?.detail);
      assert.equal(opening?.status, "pass", opening?.detail);
      assert.equal(grid?.status, "pass", grid?.detail);
      assert.equal(walls?.status, "pass", walls?.detail);
      assert.match(width?.detail ?? "", /≥10 ft/);
      assert.match(opening?.detail ?? "", /20\.0–40%/);
      assert.ok(plan.plates.filter((p) => p.role === "wall").length >= 3);
      assert.ok(plan.plates.filter((p) => p.role === "support").length >= 3);
      assert.ok(plan.voids.some((v) => v.id.startsWith("skylight")));
      assert.ok(plan.plates.filter((p) => p.role === "mezzanine").length >= (faces === 4 ? 4 : 1));
    });
  }

  it("Open Hall roof and mezzanine track field height (mezz at mid-massing)", () => {
    for (const height of [20, 40, 60] as const) {
      const plan = planOfficeWorkspace("open-hall-workspace", 0, center, { width: 60, depth: 60, height });
      const roof = plan.plates.find((p) => p.role === "roof");
      const mezz = plan.plates.find((p) => p.role === "mezzanine");
      assert.ok(roof);
      assert.ok(mezz);
      // Field bottom at −height/2; roof at top; mezz finished surface at world Z = 0 (half height).
      assert.ok(Math.abs(roof!.zTop - height / 2) < 0.3, `roof zTop ${roof!.zTop} should track field top ${height / 2}`);
      assert.ok(Math.abs(mezz!.zTop - 0) < 0.3, `mezzanine zTop ${mezz!.zTop} should sit at mid-massing (0) for height ${height}`);
      const elevation = plan.checks.find((item) => item.label === "Mezzanine elevation");
      assert.equal(elevation?.status, "pass", elevation?.detail);
      const head = plan.checks.find((item) => item.label === "Headroom");
      assert.equal(head?.status, "pass", head?.detail);
    }
  });

  it("Open Hall default field is 40 × 40 × 20", () => {
    assert.deepEqual(WORKSPACE_DEFAULT_FIELDS["open-hall-workspace"], { width: 40, depth: 40, height: 20 });
  });

  it("Open Hall always generates perimeter wall plates for viewer toggle", () => {
    const on = planOfficeWorkspace("open-hall-workspace", 0, center, {
      ...WORKSPACE_DEFAULT_FIELDS["open-hall-workspace"],
      perimeterWalls: true,
    });
    const offPref = planOfficeWorkspace("open-hall-workspace", 0, center, {
      ...WORKSPACE_DEFAULT_FIELDS["open-hall-workspace"],
      perimeterWalls: false,
    });
    assert.ok(on.plates.some((p) => p.role === "wall"));
    assert.ok(offPref.plates.some((p) => p.role === "wall"), "viewer preference must not omit wall geometry");
    assert.ok(officePlanReady(offPref), offPref.checks.filter((c) => c.status !== "pass").map((c) => `${c.label}:${c.status}`).join("; "));
    assert.match(offPref.checks.find((c) => c.label === "Perimeter walls and entry")?.detail ?? "", /viewer visibility does not change this generation rule/i);
  });

  it("every typology roof and plan track the selected field bounds", () => {
    for (const typology of OFFICE_TYPOLOGIES) {
      const base = WORKSPACE_DEFAULT_FIELDS[typology as keyof typeof WORKSPACE_DEFAULT_FIELDS];
      const tall = { ...base, height: 60 as const };
      const wide = {
        ...base,
        width: Math.min(60, base.width === 20 ? 40 : 60) as 40 | 60,
        depth: Math.min(60, base.depth === 20 ? 40 : 60) as 40 | 60,
        height: base.height,
      };
      const tallPlan = planOfficeWorkspace(typology, 0, center, tall);
      const roof = tallPlan.plates.find((p) => p.role === "roof");
      assert.ok(roof, typology);
      assert.ok(Math.abs(roof!.zTop - tall.height / 2) < 0.3, `${typology} roof ${roof!.zTop} vs field top ${tall.height / 2}`);

      const compact = planOfficeWorkspace(typology, 0, center, base);
      const expanded = planOfficeWorkspace(typology, 0, center, wide);
      const span = (plan: ReturnType<typeof planOfficeWorkspace>) => {
        const polys = plan.plates.filter((p) => p.role !== "support").map((p) => p.polygon);
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const poly of polys) for (const [x, y] of poly) {
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
        return { spanX: maxX - minX, spanY: maxY - minY };
      };
      const a = span(compact);
      const b = span(expanded);
      if (wide.width > base.width || wide.depth > base.depth) {
        assert.ok(b.spanX + b.spanY >= a.spanX + a.spanY - 1e-6, `${typology} plan should grow with a larger field (${a.spanX}×${a.spanY} → ${b.spanX}×${b.spanY})`);
      }
      assert.ok(b.spanX <= wide.width + 1e-3 && b.spanY <= wide.depth + 1e-3, `${typology} plan must stay inside field`);
    }
  });

  it("never reports an unverified status for a measured failure", () => {
    const fake: OfficeCheck[] = [
      { label: "Letter variations", status: "fail", detail: "non-L guide present" },
      { label: "Column L guides", status: "pass", detail: "ok" },
    ];
    const summary = summarizeWorkspaceChecks("open-hall-workspace", fake);
    const letter = summary.find((group) => group.section.id === "open-hall-letter");
    assert.equal(letter?.status, "fail");
    assert.equal(letter?.failed, 1);
  });
});
