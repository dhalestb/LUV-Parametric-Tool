import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parsePngPercentage, pngPercentageFits } from "./pngPercentages";

describe("png precedent percentages", () => {
  it("reads a typology and percentage from a PNG file name", () => {
    assert.deepEqual(parsePngPercentage("Vertical Void Lobby 25%.png", "Lobby"), {
      name: "Vertical Void Lobby",
      percent: 25,
    });
    assert.deepEqual(parsePngPercentage("Topographic - Ground-Field Lobby 25.png", "Lobby"), {
      name: "Topographic / Ground-Field Lobby",
      percent: 25,
    });
    assert.deepEqual(parsePngPercentage("L5 14%.png", "Lobby"), {
      name: "Linear Gallery Lobby",
      percent: 14,
    });
  });

  it("builds the mix from several PNG names and keeps the highest file for a repeated typology", () => {
    const read = pngPercentageFits([
      "Continuous Hall Lobby 11%.png",
      "Vertical Void Lobby 25%.png",
      "notes.txt",
      "Vertical Void Lobby 40%.png",
    ], "Lobby");
    assert.deepEqual(read.fits.map(fit => [fit.name, fit.percent]), [
      ["Vertical Void Lobby", 40],
      ["Continuous Hall Lobby", 11],
    ]);
    assert.equal(read.fits[0].evidence[0], "Uploaded PNG: Vertical Void Lobby 40%.png");
    assert.equal(read.warnings.length, 2);
  });

  it("rejects a lobby upload that does not name a percentage", () => {
    assert.throws(() => pngPercentageFits(["Vertical Void Lobby.png"], "Lobby"), /percentage/);
  });

  it("replaces the mix with the percentages printed in the PNG", () => {
    const read = pngPercentageFits([{
      filename: "precedents.png",
      text: "Vertical Void Lobby 40%\nCompressed Sequential Lobby 30%\nLinear Gallery Lobby 14%\nContinuous Hall Lobby 11%\nTopographic / Ground-Field Lobby 5%",
    }], "Lobby");
    assert.deepEqual(read.fits.map(fit => [fit.name, fit.percent]), [
      ["Vertical Void Lobby", 40],
      ["Compressed Sequential Lobby", 30],
      ["Linear Gallery Lobby", 14],
      ["Continuous Hall Lobby", 11],
      ["Topographic / Ground-Field Lobby", 5],
    ]);
  });

  it("reads a lobby input-share image, including decimals and short labels", () => {
    const read = pngPercentageFits([{
      filename: "lobby-hybrid.png",
      text: [
        "INPUT SHARE",
        "4 Topographical 53.5%",
        "3 Continuous 14.6%",
        "2 Compressed 12.1%",
        "linear last 10.5%",
        "1 Vertical 9.3%",
        "CRITERIA",
        "Open Volume 2.52",
        "Vertically Integrated 2.41",
      ].join("\n"),
    }], "Lobby");
    assert.deepEqual(read.fits.map(fit => [fit.name, fit.percent]), [
      ["Topographic / Ground-Field Lobby", 53.5],
      ["Continuous Hall Lobby", 14.6],
      ["Compressed Sequential Lobby", 12.1],
      ["Linear Gallery Lobby", 10.5],
      ["Vertical Void Lobby", 9.3],
    ]);
  });

  it("keeps Vertical Void when its label is glued to the rank or misread", () => {
    const lines = [
      "INPUT SHARE",
      "4 Topographical 53.5%",
      "3 Continuous 14.6%",
      "2 Compressed 12.1%",
      "linear last 10.5%",
    ];
    const glued = pngPercentageFits([{ filename: "lobby.png", text: [...lines, "1Vertical 9.3%", "CRITERIA", "Vertically Integrated 2.41"].join("\n") }], "Lobby");
    const missed = pngPercentageFits([{ filename: "lobby.png", text: [...lines, "1 Vettical 9.3%", "CRITERIA", "Vertically Integrated 2.41"].join("\n") }], "Lobby");
    for (const read of [glued, missed]) {
      assert.equal(read.fits.length, 5);
      assert.equal(read.fits.find(fit => fit.name === "Vertical Void Lobby")?.percent, 9.3);
    }
  });

  it("restores a decimal when a share is read as a number over 100", () => {
    const read = pngPercentageFits([{
      filename: "lobby-hybrid.png",
      text: "4 Topographical 535%\n3 Continuous 146%",
    }], "Lobby");
    assert.deepEqual(read.fits.map(fit => [fit.name, fit.percent]), [
      ["Topographic / Ground-Field Lobby", 53.5],
      ["Continuous Hall Lobby", 14.6],
    ]);
  });

  it("uses the percentage printed in the image when the file name disagrees", () => {
    const read = pngPercentageFits([{ filename: "Vertical Void Lobby 25%.png", text: "Vertical Void Lobby 80%" }], "Lobby");
    assert.equal(read.fits[0].percent, 80);
    assert.equal(read.fits[0].evidence[1], "Shown in image: 80%");
  });
});
