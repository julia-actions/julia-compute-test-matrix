import * as fs from 'fs';
import * as core from '@actions/core';
import * as TOML from '@iarna/toml';
import { parseSemverSpec, satisfies, compareVersions, VersionTriple } from './semver';

const ALL_EXISTING_VERSIONS: VersionTriple[] = [
  [1, 0, 5],
  [1, 1, 1],
  [1, 2, 0],
  [1, 3, 1],
  [1, 4, 2],
  [1, 5, 4],
  [1, 6, 7],
  [1, 7, 3],
  [1, 8, 5],
  [1, 9, 4],
  [1, 10, 10],
  [1, 11, 9],
  [1, 12, 5],
];

const RELEASE_VERSION: VersionTriple = [1, 12, 5];
const LTS_VERSION: VersionTriple = [1, 10, 10];

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

function addMatrixEntries(results: MatrixEntry[], v: VersionTriple, options: PlatformOptions): void {
  const vStr = formatVersion(v);

  if (options.includeWindowsX64) {
    results.push({ os: 'windows-latest', 'juliaup-channel': `${vStr}~x64` });
  }
  if (options.includeWindowsX86) {
    results.push({ os: 'windows-latest', 'juliaup-channel': `${vStr}~x86` });
  }
  if (options.includeLinuxX64) {
    results.push({ os: 'ubuntu-latest', 'juliaup-channel': `${vStr}~x64` });
  }
  if (options.includeLinuxX86) {
    results.push({ os: 'ubuntu-latest', 'juliaup-channel': `${vStr}~x86` });
  }
  if (options.includeMacosX64) {
    // There is currently no known way to run Julia 1.4 on a Mac GitHub runner, so we skip
    if (!(v[0] === 1 && v[1] === 4 && v[2] === 2)) {
      results.push({ os: 'macos-26-intel', 'juliaup-channel': `${vStr}~x64` });
    }
  }
  if (options.includeMacosAarch64 && compareVersions(v, [1, 8, 0]) >= 0) {
    results.push({ os: 'macos-26', 'juliaup-channel': `${vStr}~aarch64` });
  }
}

function addPreReleaseEntries(results: MatrixEntry[], channel: string, options: PlatformOptions): void {
  if (options.includeWindowsX64) {
    results.push({ os: 'windows-latest', 'juliaup-channel': `${channel}~x64` });
  }
  if (options.includeWindowsX86) {
    results.push({ os: 'windows-latest', 'juliaup-channel': `${channel}~x86` });
  }
  if (options.includeLinuxX64) {
    results.push({ os: 'ubuntu-latest', 'juliaup-channel': `${channel}~x64` });
  }
  if (options.includeLinuxX86) {
    results.push({ os: 'ubuntu-latest', 'juliaup-channel': `${channel}~x86` });
  }
  if (options.includeMacosX64) {
    results.push({ os: 'macos-26-intel', 'juliaup-channel': `${channel}~x64` });
  }
  if (options.includeMacosAarch64) {
    results.push({ os: 'macos-26', 'juliaup-channel': `${channel}~aarch64` });
  }
}

function run(): void {
  const projectContent = fs.readFileSync('Project.toml', 'utf8');
  const project = TOML.parse(projectContent);
  const juliaCompat = (project as any).compat?.julia as string | undefined;

  if (!juliaCompat) {
    throw new Error('No julia compat bound found in Project.toml [compat] section');
  }

  const spec = parseSemverSpec(juliaCompat);

  const allCompatibleVersions = ALL_EXISTING_VERSIONS.filter(v => satisfies(v, spec));

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
    versionSet.set(formatVersion(RELEASE_VERSION), RELEASE_VERSION);
  }

  if (core.getBooleanInput('include-lts-versions')) {
    versionSet.set(formatVersion(LTS_VERSION), LTS_VERSION);
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
    addMatrixEntries(results, v, options);
  }

  if (core.getBooleanInput('include-rc-versions')) {
    addPreReleaseEntries(results, 'rc', options);
  }

  if (core.getBooleanInput('include-beta-versions')) {
    addPreReleaseEntries(results, 'beta', options);
  }

  // Alpha versions: currently a no-op (same as Julia implementation)

  if (core.getBooleanInput('include-nightly-versions')) {
    addPreReleaseEntries(results, 'nightly', options);
  }

  console.log(JSON.stringify(results));
  core.setOutput('test-matrix', results);
}

try {
  run();
} catch (error) {
  core.setFailed((error as Error).message);
}
