import { HttpClient } from '@actions/http-client';
import { VersionTriple } from './semver';

// --- Juliaup versiondb types ---

export interface JuliaupVersionDBVersion {
  UrlPath: string;
}

export interface JuliaupVersionDBChannel {
  Version: string;
}

export interface JuliaupVersionDB {
  Version: string;
  AvailableVersions: Record<string, JuliaupVersionDBVersion>;
  AvailableChannels: Record<string, JuliaupVersionDBChannel>;
}

// --- Platform mapping ---

export type PlatformName =
  | 'windows-x64'
  | 'windows-x86'
  | 'linux-x64'
  | 'linux-x86'
  | 'macos-x64'
  | 'macos-aarch64';

const PLATFORM_TRIPLETS: Record<PlatformName, string> = {
  'windows-x64': 'x86_64-pc-windows-msvc',
  'windows-x86': 'i686-pc-windows-msvc',
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'linux-x86': 'i686-unknown-linux-gnu',
  'macos-x64': 'x86_64-apple-darwin',
  'macos-aarch64': 'aarch64-apple-darwin',
};

const DBVERSION_URL = 'https://julialang-s3.julialang.org/juliaup/DBVERSION';
const VERSIONDB_URL_TEMPLATE = 'https://julialang-s3.julialang.org/juliaup/versiondb/versiondb-{VERSION}-{PLATFORM}.json';

// --- Fetch logic ---

export async function fetchAllVersionDbs(): Promise<Map<PlatformName, JuliaupVersionDB>> {
  const http = new HttpClient('julia-compute-test-matrix');

  const dbVersionResponse = await http.get(DBVERSION_URL);
  const dbVersion = (await dbVersionResponse.readBody()).trim();
  if (!dbVersion) {
    throw new Error('Failed to fetch DBVERSION: empty response');
  }

  const platforms = Object.entries(PLATFORM_TRIPLETS) as [PlatformName, string][];
  const results = await Promise.all(
    platforms.map(async ([name, triplet]) => {
      const url = VERSIONDB_URL_TEMPLATE
        .replace('{VERSION}', dbVersion)
        .replace('{PLATFORM}', triplet);
      const response = await http.get(url);
      const body = await response.readBody();
      const db: JuliaupVersionDB = JSON.parse(body);
      return [name, db] as [PlatformName, JuliaupVersionDB];
    })
  );

  return new Map(results);
}

// --- Version extraction ---

/**
 * Parse the semver portion from a Juliaup version string like "1.10.10+0.x64.linux.gnu".
 * Returns the [major, minor, patch] triple.
 */
export function parseChannelVersion(versionStr: string): VersionTriple {
  const semver = versionStr.split('+')[0];
  // Strip pre-release tag (e.g. "1.13.0-rc1" → "1.13.0")
  const base = semver.split('-')[0];
  const parts = base.split('.').map(Number);
  if (parts.length < 3 || parts.some(isNaN)) {
    throw new Error(`Invalid channel version string: "${versionStr}"`);
  }
  return [parts[0], parts[1], parts[2]];
}

/**
 * Extract all minor versions (latest patch each) from the versiondb.
 * Uses channel keys matching "MAJOR.MINOR" (no tilde, no extra qualifier).
 * Any single platform's versiondb can be used since channel mappings are the same.
 */
export function getAllMinorVersions(db: JuliaupVersionDB): VersionTriple[] {
  const minorKeyPattern = /^\d+\.\d+$/;
  const versions: VersionTriple[] = [];

  for (const [key, channel] of Object.entries(db.AvailableChannels)) {
    if (minorKeyPattern.test(key)) {
      versions.push(parseChannelVersion(channel.Version));
    }
  }

  versions.sort((a, b) => {
    if (a[0] !== b[0]) return a[0] - b[0];
    if (a[1] !== b[1]) return a[1] - b[1];
    return a[2] - b[2];
  });

  return versions;
}

/**
 * Get the release version from the versiondb.
 */
export function getReleaseVersion(db: JuliaupVersionDB): VersionTriple {
  const channel = db.AvailableChannels['release'];
  if (!channel) {
    throw new Error('No "release" channel found in versiondb');
  }
  return parseChannelVersion(channel.Version);
}

/**
 * Get the LTS version from the versiondb.
 */
export function getLtsVersion(db: JuliaupVersionDB): VersionTriple {
  const channel = db.AvailableChannels['lts'];
  if (!channel) {
    throw new Error('No "lts" channel found in versiondb');
  }
  return parseChannelVersion(channel.Version);
}

/**
 * Check if a specific version is available on a given platform.
 * Looks for a channel key matching "MAJOR.MINOR.PATCH" in the platform's versiondb.
 */
export function isVersionAvailableOnPlatform(
  versionDbs: Map<PlatformName, JuliaupVersionDB>,
  version: VersionTriple,
  platform: PlatformName,
): boolean {
  const db = versionDbs.get(platform);
  if (!db) return false;

  const versionKey = `${version[0]}.${version[1]}.${version[2]}`;
  return versionKey in db.AvailableChannels;
}

/**
 * Resolve a pre-release channel (e.g. "rc", "beta") to its underlying version.
 * Returns null if the channel doesn't exist in the versiondb.
 */
export function resolvePreReleaseChannel(
  db: JuliaupVersionDB,
  channel: string,
): VersionTriple | null {
  const entry = db.AvailableChannels[channel];
  if (!entry) return null;
  return parseChannelVersion(entry.Version);
}
