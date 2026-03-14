import * as fs from 'fs';
import * as core from '@actions/core';
import * as TOML from '@iarna/toml';
import { parseSemverSpec, satisfies, compareVersions, VersionTriple } from './semver';
import {
  fetchAllVersionDbs,
  getAllMinorVersions,
  getReleaseVersion,
  getLtsVersion,
  isVersionAvailableOnPlatform,
  resolvePreReleaseChannel,
  PlatformName,
  JuliaupVersionDB,
} from './versions';

interface MatrixEntry {
  os: string;
  'juliaup-channel': string;
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

    if (!isVersionAvailableOnPlatform(versionDbs, v, platform)) continue;

    results.push({ os, 'juliaup-channel': `${vStr}~${arch}` });
  }
}

function addPreReleaseEntries(
  results: MatrixEntry[],
  channel: string,
  options: PlatformOptions,
  referenceDb: JuliaupVersionDB,
  selectedVersions: VersionTriple[],
): void {
  // Check if this pre-release channel resolves to a version already in the stable matrix
  const resolvedVersion = resolvePreReleaseChannel(referenceDb, channel);
  if (resolvedVersion) {
    const isDuplicate = selectedVersions.some(
      v => v[0] === resolvedVersion[0] && v[1] === resolvedVersion[1] && v[2] === resolvedVersion[2]
    );
    if (isDuplicate) return;
  }

  for (const { os, arch, enabled } of PLATFORMS) {
    if (!enabled(options)) continue;
    results.push({ os, 'juliaup-channel': `${channel}~${arch}` });
  }
}

async function run(): Promise<void> {
  const versionDbs = await fetchAllVersionDbs();

  // Use Linux x64 as the reference platform for channel queries
  const referenceDb = versionDbs.get('linux-x64')!;

  const allExistingVersions = getAllMinorVersions(referenceDb);
  const releaseVersion = getReleaseVersion(referenceDb);
  const ltsVersion = getLtsVersion(referenceDb);

  const projectContent = fs.readFileSync('Project.toml', 'utf8');
  const project = TOML.parse(projectContent);
  const juliaCompat = (project as any).compat?.julia as string | undefined;

  if (!juliaCompat) {
    throw new Error('No julia compat bound found in Project.toml [compat] section');
  }

  const spec = parseSemverSpec(juliaCompat);

  const allCompatibleVersions = allExistingVersions.filter(v => satisfies(v, spec));

  const versionSet = new Map<string, VersionTriple>();

  const options: PlatformOptions = {
    includeWindowsX64: core.getBooleanInput('include-windows-x64'),
    includeWindowsX86: core.getBooleanInput('include-windows-x86'),
    includeLinuxX64: core.getBooleanInput('include-linux-x64'),
    includeLinuxX86: core.getBooleanInput('include-linux-x86'),
    includeMacosX64: core.getBooleanInput('include-macos-x64'),
    includeMacosAarch64: core.getBooleanInput('include-macos-aarch64'),
  };

  if (core.getBooleanInput('include-release-versions')) {
    versionSet.set(formatVersion(releaseVersion), releaseVersion);
  }

  if (core.getBooleanInput('include-lts-versions')) {
    versionSet.set(formatVersion(ltsVersion), ltsVersion);
  }

  if (core.getBooleanInput('include-all-compatible-minor-versions')) {
    for (const v of allCompatibleVersions) {
      versionSet.set(formatVersion(v), v);
    }
  }

  if (core.getBooleanInput('include-smallest-compatible-minor-versions')) {
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

  if (core.getBooleanInput('include-rc-versions')) {
    addPreReleaseEntries(results, 'rc', options, referenceDb, selectedVersions);
  }

  if (core.getBooleanInput('include-beta-versions')) {
    addPreReleaseEntries(results, 'beta', options, referenceDb, selectedVersions);
  }

  // Alpha versions: currently a no-op (same as Julia implementation)

  if (core.getBooleanInput('include-nightly-versions')) {
    addPreReleaseEntries(results, 'nightly', options, referenceDb, selectedVersions);
  }

  console.log(JSON.stringify(results));
  core.setOutput('test-matrix', results);
}

run().catch(error => {
  core.setFailed((error as Error).message);
});
