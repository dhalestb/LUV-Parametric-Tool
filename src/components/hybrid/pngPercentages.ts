import { LATTICE_SLOTS } from "../lattice/slots";
import type { Family, Fit } from "./analyzeHybrid";

export type PngPercentageRead = { fits: Fit[]; warnings: string[] };

function normalize(value: string) {
  return value.toLowerCase().replace(/[_/-]+/g, " ").replace(/[^a-z0-9.%\s]/g, " ").replace(/\s+/g, " ").trim();
}

function mentions(text: string, key: string) {
  const needle = normalize(key);
  if (!needle) return false;
  if (needle.length <= 3) return new RegExp("(?:^|\\s)" + needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?:\\s|$)").test(text);
  return text.includes(needle);
}

export type PngSource = string | { filename: string; text?: string };

function slotsFor(family: Family) {
  return LATTICE_SLOTS.filter(slot => family === "Hybrid" || slot.category === family);
}

/** Short labels used by the external input-share images, such as "4 Topographical 53.5%". */
const SHARE_ALIASES: Record<string, string[]> = {
  "Vertical Void Lobby": ["vertical"],
  "Compressed Sequential Lobby": ["compressed"],
  "Continuous Hall Lobby": ["continuous"],
  "Topographic / Ground-Field Lobby": ["topographical", "topographic"],
  "Linear Gallery Lobby": ["linear last", "linear"],
};

export function shownPercent(value: number) {
  const text = (Math.round(value * 10) / 10).toFixed(1);
  return text.endsWith(".0") ? text.slice(0, -2) : text;
}

function shareValue(raw: string) {
  const number = Number(raw);
  if (!Number.isFinite(number) || number < 0) return null;
  const value = !raw.includes(".") && number > 100 && number <= 1000 ? number / 10 : number;
  if (value > 100) return null;
  return Math.round(value * 10) / 10;
}

function shareRegion(text: string) {
  const normalized = normalize(text);
  const start = normalized.indexOf("input share");
  const body = start >= 0 ? normalized.slice(start) : normalized;
  const criteria = body.search(/\bcriteria\b/);
  return criteria >= 0 ? body.slice(0, criteria) : body;
}

function readShares(text: string) {
  const region = shareRegion(text);
  const shares: { label: string; percent: number }[] = [];
  const pattern = /(\d+(?:\.\d+)?)\s*(?:%|percent)/g;
  let last = 0;
  for (const match of region.matchAll(pattern)) {
    const percent = shareValue(match[1]);
    if (percent === null || match.index === undefined) continue;
    shares.push({ label: region.slice(last, match.index), percent });
    last = match.index + match[0].length;
  }
  return shares;
}

function hasLabel(label: string, phrase: string) {
  const needle = normalize(phrase);
  if (needle.length < 4) return false;
  const spaced = label.replace(/(\d)([a-z])/g, "$1 $2");
  if (needle === "vertical") return /(?:^|\s)vertical(?=\s|$)/.test(spaced);
  return spaced.includes(needle);
}

function typologyFor(label: string, slots: ReturnType<typeof slotsFor>) {
  let best: { name: string; length: number } | null = null;
  for (const slot of slots) {
    for (const key of [slot.name, ...slot.keys, ...(SHARE_ALIASES[slot.name] ?? [])]) {
      if (!hasLabel(label, key)) continue;
      const length = normalize(key).length;
      if (!best || length > best.length) best = { name: slot.name, length };
    }
  }
  return best?.name ?? null;
}

/** Read typology percentages printed in a PNG, such as "4 Topographical 53.5%" or "1 Vertical 9.3%". */
export function fitsFromShownText(text: string, family: Family): { name: string; percent: number }[] {
  const slots = slotsFor(family);
  const shares = readShares(text);
  const assigned = new Map<string, number>();
  const pending: number[] = [];
  for (const share of shares) {
    const name = typologyFor(share.label, slots.filter(slot => !assigned.has(slot.name)));
    if (name) assigned.set(name, share.percent);
    else pending.push(share.percent);
  }
  const missing = slots.filter(slot => !assigned.has(slot.name));
  if (pending.length === 1 && missing.length === 1 && shares.length === slots.length) {
    assigned.set(missing[0].name, pending[0]);
  }
  return slots.filter(slot => assigned.has(slot.name)).map(slot => ({ name: slot.name, percent: assigned.get(slot.name) ?? 0 }));
}

/** Read a precedent percentage from a PNG file name such as "Vertical Void Lobby 25%.png". */
export function parsePngPercentage(filename: string, family: Family): { name: string; percent: number } {
  if (!/\.png$/i.test(filename)) throw Error(filename + " is not a PNG.");
  const stem = normalize(filename.replace(/\.png$/i, ""));
  const marked = stem.match(/(\d+(?:\.\d+)?)\s*%/);
  const bare = [...stem.matchAll(/(?:^|\s)(\d+(?:\.\d+)?)(?=\s|$)/g)]
    .map(match => Number(match[1]))
    .filter(value => value >= 0 && value <= 100);
  const percent = marked ? Number(marked[1]) : bare[bare.length - 1];
  if (percent === undefined || !Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw Error(filename + " needs a percentage from 0 to 100 in its name, such as Vertical Void Lobby 25%.png.");
  }
  const label = stem.replace(marked?.[0] ?? String(percent), " ").replace(/\s+/g, " ").trim();
  const slots = slotsFor(family);
  let best: { name: string; length: number } | null = null;
  for (const slot of slots) {
    for (const key of [slot.name, slot.code, ...slot.keys]) {
      if (!mentions(label, key) && !mentions(stem, key)) continue;
      const length = normalize(key).length;
      if (!best || length > best.length) best = { name: slot.name, length };
    }
  }
  if (!best) throw Error(filename + " does not name a " + (family === "Hybrid" ? "known" : family.toLowerCase()) + " typology.");
  return { name: best.name, percent: Math.round(percent) };
}

function applyFit(fits: Fit[], parsed: { name: string; percent: number }, filename: string, warnings: string[]) {
  const evidence = ["Uploaded PNG: " + filename, "Shown in image: " + shownPercent(parsed.percent) + "%"];
  const previous = fits.find(fit => fit.name === parsed.name);
  if (previous) {
    previous.percent = parsed.percent;
    previous.evidence = evidence;
    warnings.push(parsed.name + " uses " + filename + ".");
  } else {
    fits.push({ name: parsed.name, percent: parsed.percent, evidence });
  }
}

export function pngPercentageFits(sources: PngSource[], family: Family): PngPercentageRead {
  const fits: Fit[] = [];
  const warnings: string[] = [];
  for (const source of sources) {
    const filename = typeof source === "string" ? source : source.filename;
    const text = typeof source === "string" ? "" : source.text ?? "";
    const shown = text.trim() ? fitsFromShownText(text, family) : [];
    if (shown.length) {
      for (const parsed of shown) applyFit(fits, parsed, filename, warnings);
      continue;
    }
    try {
      applyFit(fits, parsePngPercentage(filename, family), filename, warnings);
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : filename);
    }
  }
  if (!fits.length) throw Error(warnings[0] ?? "Choose one or more PNG files.");
  fits.sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name));
  return { fits, warnings };
}
