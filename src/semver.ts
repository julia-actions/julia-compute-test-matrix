export type VersionTriple = [number, number, number];

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  numParts: number;
}

export interface VersionRange {
  lower: VersionTriple;
  upper: VersionTriple | null;
}

function parseVersion(str: string): ParsedVersion {
  const parts = str.trim().split('.').map(s => {
    const n = parseInt(s, 10);
    if (isNaN(n) || n < 0) throw new Error(`Invalid version component: "${s}" in "${str}"`);
    return n;
  });
  if (parts.length < 1 || parts.length > 3) {
    throw new Error(`Invalid version string: "${str}"`);
  }
  return {
    major: parts[0],
    minor: parts.length > 1 ? parts[1] : 0,
    patch: parts.length > 2 ? parts[2] : 0,
    numParts: parts.length,
  };
}

export function compareVersions(a: VersionTriple, b: VersionTriple): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];
  return a[2] - b[2];
}

/**
 * Convert a parsed version (used as an inclusive upper bound) to an exclusive upper bound.
 * Increments the last specified component based on numParts.
 */
function boundToExclusive(v: ParsedVersion): VersionTriple {
  if (v.numParts === 3) return [v.major, v.minor, v.patch + 1];
  if (v.numParts === 2) return [v.major, v.minor + 1, 0];
  return [v.major + 1, 0, 0];
}

/**
 * Compute a caret range — Julia's default compat behavior.
 *
 *   ^1.6.3 → [1.6.3, 2.0.0)
 *   ^0.6.3 → [0.6.3, 0.7.0)
 *   ^0.0.3 → [0.0.3, 0.0.4)
 *   ^1.6   → [1.6.0, 2.0.0)
 *   ^0.0   → [0.0.0, 0.1.0)
 */
function caretRange(v: ParsedVersion): VersionRange {
  const lower: VersionTriple = [v.major, v.minor, v.patch];
  const specified = [v.major, v.minor, v.patch].slice(0, v.numParts);
  const firstNonZero = specified.findIndex(p => p > 0);

  let upper: VersionTriple;
  if (firstNonZero === 0) {
    upper = [v.major + 1, 0, 0];
  } else if (firstNonZero === 1) {
    upper = [v.major, v.minor + 1, 0];
  } else if (firstNonZero === 2) {
    upper = [v.major, v.minor, v.patch + 1];
  } else {
    // All specified parts are zero — bump the last specified part
    if (v.numParts <= 1) upper = [1, 0, 0];
    else if (v.numParts === 2) upper = [0, 1, 0];
    else upper = [0, 0, 1];
  }

  return { lower, upper };
}

/**
 * Compute a tilde range.
 *   ~1.6.3 → [1.6.3, 1.7.0)
 *   ~1.6   → [1.6.0, 1.7.0)
 *   ~1     → [1.0.0, 2.0.0)
 */
function tildeRange(v: ParsedVersion): VersionRange {
  const lower: VersionTriple = [v.major, v.minor, v.patch];
  let upper: VersionTriple;
  if (v.numParts >= 2) {
    upper = [v.major, v.minor + 1, 0];
  } else {
    upper = [v.major + 1, 0, 0];
  }
  return { lower, upper };
}

function parseSingleSpec(spec: string): VersionRange | null {
  spec = spec.trim();
  if (!spec) return null;

  // Hyphen range: "X.Y - A.B"
  if (spec.includes(' - ')) {
    const [loStr, hiStr] = spec.split(' - ').map(s => s.trim());
    const lo = parseVersion(loStr);
    const hi = parseVersion(hiStr);
    return {
      lower: [lo.major, lo.minor, lo.patch],
      upper: boundToExclusive(hi),
    };
  }

  let m: RegExpMatchArray | null;

  if ((m = spec.match(/^>=\s*([\d.]+)$/))) {
    const v = parseVersion(m[1]);
    return { lower: [v.major, v.minor, v.patch], upper: null };
  }

  if ((m = spec.match(/^>\s*([\d.]+)$/))) {
    const v = parseVersion(m[1]);
    return { lower: boundToExclusive(v), upper: null };
  }

  if ((m = spec.match(/^<=\s*([\d.]+)$/))) {
    const v = parseVersion(m[1]);
    return { lower: [0, 0, 0], upper: boundToExclusive(v) };
  }

  if ((m = spec.match(/^<\s*([\d.]+)$/))) {
    const v = parseVersion(m[1]);
    return { lower: [0, 0, 0], upper: [v.major, v.minor, v.patch] };
  }

  if ((m = spec.match(/^=\s*([\d.]+)$/))) {
    const v = parseVersion(m[1]);
    return { lower: [v.major, v.minor, v.patch], upper: boundToExclusive(v) };
  }

  if ((m = spec.match(/^~\s*([\d.]+)$/))) {
    const v = parseVersion(m[1]);
    return tildeRange(v);
  }

  if ((m = spec.match(/^\^\s*([\d.]+)$/))) {
    const v = parseVersion(m[1]);
    return caretRange(v);
  }

  // Bare version — treated as caret (Julia's default)
  const v = parseVersion(spec);
  return caretRange(v);
}

export function parseSemverSpec(specStr: string): VersionRange[] {
  const ranges: VersionRange[] = [];
  for (const part of specStr.split(',')) {
    const range = parseSingleSpec(part);
    if (range) ranges.push(range);
  }
  return ranges;
}

export function satisfies(version: VersionTriple, ranges: VersionRange[]): boolean {
  return ranges.some(range => {
    if (compareVersions(version, range.lower) < 0) return false;
    if (range.upper !== null && compareVersions(version, range.upper) >= 0) return false;
    return true;
  });
}
