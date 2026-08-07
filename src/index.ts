import * as fs from 'fs';
import * as path from 'path';
import * as core from '@actions/core';
import * as TOML from '@iarna/toml';
import { parseSemverSpec, satisfies, compareVersions, VersionTriple } from './semver';
import {
  fetchAllVersionDbs,
  getAllMinorVersions,
  getReleaseVersion,
  getLtsVersion,
  isVersionAvailableOnPlatform,
  isChannelAvailableOnPlatform,
  resolvePreReleaseChannel,
  PlatformName,
  JuliaupVersionDB,
} from './versions';

interface MatrixEntry {
  os: string;
  'juliaup-channel': string;
  experimental: boolean;
}

const INPUT_DEFAULTS: Record<string, boolean> = {
  'include-release-versions': true,
  'include-lts-versions': true,
  'include-all-compatible-minor-versions': false,
  'include-smallest-compatible-minor-versions': true,
  'include-rc-versions': false,
  'include-beta-versions': false,
  'include-alpha-versions': false,
  'include-nightly-versions': false,
  'include-windows-x64': true,
  'include-windows-x86': true,
  'include-linux-x64': true,
  'include-linux-x86': true,
  'include-macos-x64': true,
  'include-macos-aarch64': true,
};

// Like core.getBooleanInput, but an empty/unset input falls back to the
// action.yml default instead of throwing (callers often pass through
// expressions that resolve to '').
function getBoolInput(name: string): boolean {
  const raw = core.getInput(name).trim().toLowerCase();
  if (raw === '') return INPUT_DEFAULTS[name];
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new TypeError(`Input "${name}" must be 'true' or 'false', got '${raw}'`);
}

interface PlatformOptions {
  includeWindowsX64: boolean;
  includeWindowsX86: boolean;
  includeLinuxX64: boolean;
  includeLinuxX86: boolean;
  includeMacosX64: boolean;
  includeMacosAarch64: boolean;
}

function formatVersion(v: VersionTriple): string {
  return `${v[0]}.${v[1]}.${v[2]}`;
}

interface PlatformEntry {
  platform: PlatformName;
  os: string;
  arch: string;
  enabled: (options: PlatformOptions) => boolean;
}

const PLATFORMS: PlatformEntry[] = [
  { platform: 'windows-x64', os: 'windows-latest', arch: 'x64', enabled: (o) => o.includeWindowsX64 },
  { platform: 'windows-x86', os: 'windows-latest', arch: 'x86', enabled: (o) => o.includeWindowsX86 },
  { platform: 'linux-x64', os: 'ubuntu-latest', arch: 'x64', enabled: (o) => o.includeLinuxX64 },
  { platform: 'linux-x86', os: 'ubuntu-latest', arch: 'x86', enabled: (o) => o.includeLinuxX86 },
  { platform: 'macos-x64', os: 'macos-26-intel', arch: 'x64', enabled: (o) => o.includeMacosX64 },
  { platform: 'macos-aarch64', os: 'macos-26', arch: 'aarch64', enabled: (o) => o.includeMacosAarch64 },
];

function addMatrixEntries(
  results: MatrixEntry[],
  v: VersionTriple,
  options: PlatformOptions,
  versionDbs: Map<PlatformName, JuliaupVersionDB>,
): void {
  const vStr = formatVersion(v);

  for (const { platform, os, arch, enabled } of PLATFORMS) {
    if (!enabled(options)) continue;

    // Julia 1.4 on macOS doesn't work despite existing in the versiondb
    if (platform === 'macos-x64' && v[0] === 1 && v[1] === 4) continue;

    if (!isVersionAvailableOnPlatform(versionDbs, v, platform, arch)) continue;

    results.push({ os, 'juliaup-channel': `${vStr}~${arch}`, experimental: false });
  }
}

function addPreReleaseEntries(
  results: MatrixEntry[],
  channel: string,
  options: PlatformOptions,
  referenceDb: JuliaupVersionDB,
  selectedVersions: VersionTriple[],
  versionDbs: Map<PlatformName, JuliaupVersionDB>,
): void {
  // Check if this pre-release channel resolves to a version already in the stable matrix
  const resolvedVersion = resolvePreReleaseChannel(referenceDb, channel);
  if (resolvedVersion) {
    const isDuplicate = selectedVersions.some(
      v => v[0] === resolvedVersion[0] && v[1] === resolvedVersion[1] && v[2] === resolvedVersion[2]
    );
    if (isDuplicate) return;
  }

  for (const { platform, os, arch, enabled } of PLATFORMS) {
    if (!enabled(options)) continue;
    // The nightly channel is resolved by juliaup itself and never appears in the
    // versiondb, so the availability check only applies to the other channels.
    if (channel !== 'nightly' && !isChannelAvailableOnPlatform(versionDbs, channel, platform, arch)) continue;
    results.push({ os, 'juliaup-channel': `${channel}~${arch}`, experimental: true });
  }
}

async function run(): Promise<void> {
  const versionDbs = await fetchAllVersionDbs();

  // Use Linux x64 as the reference platform for channel queries
  const referenceDb = versionDbs.get('linux-x64')!;

  const allExistingVersions = getAllMinorVersions(referenceDb);
  const releaseVersion = getReleaseVersion(referenceDb);
  const ltsVersion = getLtsVersion(referenceDb);

  const projectDir = core.getInput('project-path') || '.';
  const projectFile = ['JuliaProject.toml', 'Project.toml']
    .map(f => path.join(projectDir, f))
    .find(f => fs.existsSync(f));
  if (!projectFile) {
    throw new Error(`No Project.toml or JuliaProject.toml found in '${projectDir}'`);
  }
  const projectContent = fs.readFileSync(projectFile, 'utf8');
  const project = TOML.parse(projectContent);
  const juliaCompat = (project as any).compat?.julia as string | undefined;

  if (!juliaCompat) {
    throw new Error('No julia compat bound found in Project.toml [compat] section');
  }

  const spec = parseSemverSpec(juliaCompat);

  const allCompatibleVersions = allExistingVersions.filter(v => satisfies(v, spec));

  const versionSet = new Map<string, VersionTriple>();

  const options: PlatformOptions = {
    includeWindowsX64: getBoolInput('include-windows-x64'),
    includeWindowsX86: getBoolInput('include-windows-x86'),
    includeLinuxX64: getBoolInput('include-linux-x64'),
    includeLinuxX86: getBoolInput('include-linux-x86'),
    includeMacosX64: getBoolInput('include-macos-x64'),
    includeMacosAarch64: getBoolInput('include-macos-aarch64'),
  };

  if (getBoolInput('include-release-versions')) {
    versionSet.set(formatVersion(releaseVersion), releaseVersion);
  }

  if (getBoolInput('include-lts-versions')) {
    versionSet.set(formatVersion(ltsVersion), ltsVersion);
  }

  if (getBoolInput('include-all-compatible-minor-versions')) {
    for (const v of allCompatibleVersions) {
      versionSet.set(formatVersion(v), v);
    }
  }

  if (getBoolInput('include-smallest-compatible-minor-versions')) {
    if (allCompatibleVersions.length > 0) {
      const sorted = [...allCompatibleVersions].sort((a, b) => compareVersions(a, b));
      versionSet.set(formatVersion(sorted[0]), sorted[0]);
    }
  }

  // Filter to only compatible versions
  for (const [key, v] of versionSet) {
    if (!satisfies(v, spec)) {
      versionSet.delete(key);
    }
  }

  const results: MatrixEntry[] = [];

  const selectedVersions = [...versionSet.values()].sort((a, b) => compareVersions(a, b));

  for (const v of selectedVersions) {
    addMatrixEntries(results, v, options, versionDbs);
  }

  if (getBoolInput('include-rc-versions')) {
    addPreReleaseEntries(results, 'rc', options, referenceDb, selectedVersions, versionDbs);
  }

  if (getBoolInput('include-beta-versions')) {
    addPreReleaseEntries(results, 'beta', options, referenceDb, selectedVersions, versionDbs);
  }

  if (getBoolInput('include-alpha-versions')) {
    addPreReleaseEntries(results, 'alpha', options, referenceDb, selectedVersions, versionDbs);
  }

  if (getBoolInput('include-nightly-versions')) {
    addPreReleaseEntries(results, 'nightly', options, referenceDb, selectedVersions, versionDbs);
  }

  console.log(JSON.stringify(results));
  core.setOutput('test-matrix', results);
}

run().catch(error => {
  core.setFailed((error as Error).message);
});
