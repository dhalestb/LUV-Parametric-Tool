/**
 * Match a session OBJ to an official registry filename when the names
 * describe the same form but are not identical.
 *
 * Exact match is preferred. Otherwise the stem is token-sorted so that
 * "void workspace.obj" and "workspace void.obj" agree, slot prefixes such
 * as "G4 " are ignored, and punctuation is treated as a separator.
 */
const SLOT_PREFIX = /^(g|o|l)\d[\s._-]*/i;

export function formIdentityKey(filename: string): string {
  const base = filename.replace(/\\/g, "/").split("/").pop() ?? filename;
  const stem = base.replace(/\.obj$/i, "").toLowerCase();
  const stripped = stem.replace(SLOT_PREFIX, "");
  const tokens = stripped
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0)
    .sort();
  return tokens.join(" ");
}

export function filenamesMatch(left: string, right: string): boolean {
  if (!left || !right) return false;
  if (left.toLowerCase() === right.toLowerCase()) return true;
  const a = formIdentityKey(left);
  const b = formIdentityKey(right);
  return a.length > 0 && a === b;
}

export function findMatchingFilename<T extends { filename: string }>(
  filename: string | undefined,
  items: T[] | undefined,
): T | undefined {
  if (!filename || !items?.length) return undefined;
  const exact = items.find((item) => item.filename.toLowerCase() === filename.toLowerCase());
  if (exact) return exact;
  const key = formIdentityKey(filename);
  if (!key) return undefined;
  const matches = items.filter((item) => formIdentityKey(item.filename) === key);
  return matches.length === 1 ? matches[0] : undefined;
}
