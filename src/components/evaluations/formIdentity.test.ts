import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filenamesMatch, findMatchingFilename, formIdentityKey } from "./formIdentity.ts";

describe("formIdentity", () => {
  it("treats word-order variants as the same form", () => {
    assert.equal(formIdentityKey("workspace void.obj"), formIdentityKey("void workspace.obj"));
    assert.ok(filenamesMatch("workspace void.obj", "void workspace.obj"));
  });

  it("ignores slot prefixes, punctuation, and extension case", () => {
    assert.ok(filenamesMatch("G4 Gathering, Room within Volume.obj", "Gathering, Room within Volume.OBJ"));
    assert.ok(filenamesMatch("O4 workspace void.obj", "workspace void.obj"));
  });

  it("does not collapse distinct forms that share one token", () => {
    assert.equal(filenamesMatch("Gathering Linear.obj", "Lobby, Linear.obj"), false);
    assert.equal(filenamesMatch("Lobby Continuous Hall.obj", "workspace open hall.obj"), false);
  });

  it("does not collapse a different geometry version onto the official file", () => {
    assert.equal(filenamesMatch("workspace void.obj", "workspace void v2.obj"), false);
    assert.equal(filenamesMatch("Gathering Linear.obj", "Gathering Linear revised.obj"), false);
    const rows = [
      { filename: "workspace void.obj", rank: 8 },
      { filename: "void workspace alt.obj", rank: 3 },
    ];
    assert.equal(findMatchingFilename("void workspace.obj", rows)?.rank, 8);
    assert.equal(findMatchingFilename("workspace void v2.obj", rows), undefined);
  });

  it("refuses an ambiguous token match when two registry files share an identity", () => {
    const rows = [
      { filename: "workspace void.obj", rank: 8 },
      { filename: "void workspace.obj", rank: 3 },
    ];
    assert.equal(findMatchingFilename("workspace void.obj", rows)?.rank, 8);
    assert.equal(findMatchingFilename("void-workspace.obj", rows), undefined);
  });

  it("finds the registry row for a reordered session filename", () => {
    const rows = [
      { filename: "workspace void.obj", rank: 8 },
      { filename: "Gathering Linear.obj", rank: 2 },
    ];
    assert.equal(findMatchingFilename("void workspace.obj", rows)?.rank, 8);
    assert.equal(findMatchingFilename("G5 Gathering Linear.obj", rows)?.rank, 2);
    assert.equal(findMatchingFilename("missing.obj", rows), undefined);
  });
});
