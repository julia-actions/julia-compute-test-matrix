import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import {
  parseChannelVersion,
  getAllMinorVersions,
  getReleaseVersion,
  getLtsVersion,
  isVersionAvailableOnPlatform,
  isChannelAvailableOnPlatform,
  resolvePreReleaseChannel,
  parseChannelVersionFull,
  preReleaseIsRedundant,
  JuliaupVersionDB,
  PlatformName,
} from '../src/versions';

function makeDb(channels: Record<string, { Version: string }>): JuliaupVersionDB {
  return {
    Version: '1.0.0',
    AvailableVersions: {},
    AvailableChannels: channels,
  };
}

describe('parseChannelVersion', () => {
  it('parses version+build metadata', () => {
    assert.deepStrictEqual(parseChannelVersion('1.10.10+0.x64.linux.gnu'), [1, 10, 10]);
  });

  it('parses version without build metadata', () => {
    assert.deepStrictEqual(parseChannelVersion('1.12.5+0.x64.apple.darwin14'), [1, 12, 5]);
  });

  it('throws on invalid version', () => {
    assert.throws(() => parseChannelVersion('invalid'));
  });
});

describe('getAllMinorVersions', () => {
  it('extracts minor versions from channel keys', () => {
    const db = makeDb({
      '1.6': { Version: '1.6.7+0.x64.linux.gnu' },
      '1.10': { Version: '1.10.10+0.x64.linux.gnu' },
      '1.12': { Version: '1.12.5+0.x64.linux.gnu' },
      // These should be ignored (not bare major.minor):
      'release': { Version: '1.12.5+0.x64.linux.gnu' },
      'lts': { Version: '1.10.10+0.x64.linux.gnu' },
      '1.10~x64': { Version: '1.10.10+0.x64.linux.gnu' },
      '1.12.5': { Version: '1.12.5+0.x64.linux.gnu' },
      '1.12.5~x64': { Version: '1.12.5+0.x64.linux.gnu' },
      'rc': { Version: '1.13.0-rc1+0.x64.linux.gnu' },
    });

    const versions = getAllMinorVersions(db);
    assert.deepStrictEqual(versions, [
      [1, 6, 7],
      [1, 10, 10],
      [1, 12, 5],
    ]);
  });

  it('skips a minor channel that still points at a pre-release', () => {
    const db = makeDb({
      '1.12': { Version: '1.12.7+0.x64.linux.gnu' },
      // Before 1.13.0 ships, juliaup maps the "1.13" channel to the newest RC. There is no
      // released 1.13.0 to test, and no "1.13.0~x64" binary either.
      '1.13': { Version: '1.13.0-rc3+0.x64.linux.gnu' },
    });

    assert.deepStrictEqual(getAllMinorVersions(db), [[1, 12, 7]]);
  });

  it('includes a minor channel once it points at a final release', () => {
    const db = makeDb({
      '1.12': { Version: '1.12.7+0.x64.linux.gnu' },
      '1.13': { Version: '1.13.0+0.x64.linux.gnu' },
    });

    assert.deepStrictEqual(getAllMinorVersions(db), [[1, 12, 7], [1, 13, 0]]);
  });

  it('returns empty array when no minor channels exist', () => {
    const db = makeDb({ 'release': { Version: '1.12.5+0.x64.linux.gnu' } });
    assert.deepStrictEqual(getAllMinorVersions(db), []);
  });

  it('returns versions sorted', () => {
    const db = makeDb({
      '1.12': { Version: '1.12.5+0.x64.linux.gnu' },
      '1.6': { Version: '1.6.7+0.x64.linux.gnu' },
      '1.0': { Version: '1.0.5+0.x64.linux.gnu' },
      '1.10': { Version: '1.10.10+0.x64.linux.gnu' },
    });

    const versions = getAllMinorVersions(db);
    assert.deepStrictEqual(versions, [
      [1, 0, 5],
      [1, 6, 7],
      [1, 10, 10],
      [1, 12, 5],
    ]);
  });
});

describe('getReleaseVersion', () => {
  it('returns the release channel version', () => {
    const db = makeDb({ 'release': { Version: '1.12.5+0.x64.linux.gnu' } });
    assert.deepStrictEqual(getReleaseVersion(db), [1, 12, 5]);
  });

  it('throws when no release channel', () => {
    const db = makeDb({});
    assert.throws(() => getReleaseVersion(db), /release/);
  });
});

describe('getLtsVersion', () => {
  it('returns the lts channel version', () => {
    const db = makeDb({ 'lts': { Version: '1.10.10+0.x64.linux.gnu' } });
    assert.deepStrictEqual(getLtsVersion(db), [1, 10, 10]);
  });

  it('throws when no lts channel', () => {
    const db = makeDb({});
    assert.throws(() => getLtsVersion(db), /lts/);
  });
});

describe('isVersionAvailableOnPlatform', () => {
  it('returns true when arch-specific version channel exists', () => {
    const db = makeDb({ '1.10.10~x64': { Version: '1.10.10+0.x64.linux.gnu' } });
    const dbs = new Map<PlatformName, JuliaupVersionDB>([['linux-x64', db]]);
    assert.strictEqual(isVersionAvailableOnPlatform(dbs, [1, 10, 10], 'linux-x64', 'x64'), true);
  });

  it('returns false when version channel does not exist', () => {
    const db = makeDb({ '1.10.10~x64': { Version: '1.10.10+0.x64.linux.gnu' } });
    const dbs = new Map<PlatformName, JuliaupVersionDB>([['linux-x64', db]]);
    assert.strictEqual(isVersionAvailableOnPlatform(dbs, [1, 4, 2], 'linux-x64', 'x64'), false);
  });

  it('returns false when platform does not exist', () => {
    const dbs = new Map<PlatformName, JuliaupVersionDB>();
    assert.strictEqual(isVersionAvailableOnPlatform(dbs, [1, 10, 10], 'macos-x64', 'x64'), false);
  });

  it('returns false when plain version exists but arch-specific does not (Rosetta scenario)', () => {
    const db = makeDb({
      '1.6.7': { Version: '1.6.7+0.x64.apple.darwin14' },
      '1.6.7~x64': { Version: '1.6.7+0.x64.apple.darwin14' },
      // No 1.6.7~aarch64 — only x64 binary available (via Rosetta)
    });
    const dbs = new Map<PlatformName, JuliaupVersionDB>([['macos-aarch64', db]]);
    assert.strictEqual(isVersionAvailableOnPlatform(dbs, [1, 6, 7], 'macos-aarch64', 'aarch64'), false);
  });

  it('returns true when native aarch64 binary exists', () => {
    const db = makeDb({
      '1.10.10': { Version: '1.10.10+0.aarch64.apple.darwin14' },
      '1.10.10~aarch64': { Version: '1.10.10+0.aarch64.apple.darwin14' },
      '1.10.10~x64': { Version: '1.10.10+0.x64.apple.darwin14' },
    });
    const dbs = new Map<PlatformName, JuliaupVersionDB>([['macos-aarch64', db]]);
    assert.strictEqual(isVersionAvailableOnPlatform(dbs, [1, 10, 10], 'macos-aarch64', 'aarch64'), true);
  });
});

describe('isChannelAvailableOnPlatform', () => {
  it('returns true when arch-specific channel exists', () => {
    const db = makeDb({ 'rc~aarch64': { Version: '1.13.0-rc1+0.aarch64.apple.darwin14' } });
    const dbs = new Map<PlatformName, JuliaupVersionDB>([['macos-aarch64', db]]);
    assert.strictEqual(isChannelAvailableOnPlatform(dbs, 'rc', 'macos-aarch64', 'aarch64'), true);
  });

  it('returns false when arch-specific channel does not exist', () => {
    const db = makeDb({ 'rc': { Version: '1.13.0-rc1+0.x64.apple.darwin14' } });
    const dbs = new Map<PlatformName, JuliaupVersionDB>([['macos-aarch64', db]]);
    assert.strictEqual(isChannelAvailableOnPlatform(dbs, 'rc', 'macos-aarch64', 'aarch64'), false);
  });

  it('returns false when platform does not exist', () => {
    const dbs = new Map<PlatformName, JuliaupVersionDB>();
    assert.strictEqual(isChannelAvailableOnPlatform(dbs, 'rc', 'macos-aarch64', 'aarch64'), false);
  });
});

describe('resolvePreReleaseChannel', () => {
  it('resolves rc channel to its version', () => {
    const db = makeDb({ 'rc': { Version: '1.13.0-rc1+0.x64.linux.gnu' } });
    assert.deepStrictEqual(resolvePreReleaseChannel(db, 'rc'), { version: [1, 13, 0], prerelease: 'rc1' });
  });

  it('returns null when channel does not exist', () => {
    const db = makeDb({});
    assert.strictEqual(resolvePreReleaseChannel(db, 'rc'), null);
  });

  it('resolves beta channel', () => {
    const db = makeDb({ 'beta': { Version: '1.14.0-beta1+0.x64.linux.gnu' } });
    assert.deepStrictEqual(resolvePreReleaseChannel(db, 'beta'), { version: [1, 14, 0], prerelease: 'beta1' });
  });
});

describe('parseChannelVersionFull', () => {
  it('keeps the pre-release tag', () => {
    assert.deepStrictEqual(parseChannelVersionFull('1.13.0-rc3+0.x64.linux.gnu'), {
      version: [1, 13, 0],
      prerelease: 'rc3',
    });
  });

  it('reports null for a final release', () => {
    assert.deepStrictEqual(parseChannelVersionFull('1.12.5+0.x64.apple.darwin14'), {
      version: [1, 12, 5],
      prerelease: null,
    });
  });
});

describe('preReleaseIsRedundant', () => {
  it('is redundant once the same version ships stable', () => {
    assert.strictEqual(
      preReleaseIsRedundant({ version: [1, 13, 0], prerelease: 'rc3' }, [[1, 12, 7], [1, 13, 0]]),
      true,
    );
  });

  it('is not redundant while only older stable versions are selected', () => {
    assert.strictEqual(
      preReleaseIsRedundant({ version: [1, 13, 0], prerelease: 'rc3' }, [[1, 11, 9], [1, 12, 7]]),
      false,
    );
  });

  it('is not redundant for a newer minor than anything stable', () => {
    assert.strictEqual(
      preReleaseIsRedundant({ version: [1, 14, 0], prerelease: 'rc1' }, [[1, 13, 0]]),
      false,
    );
  });

  it('is redundant when a newer stable version is selected', () => {
    assert.strictEqual(
      preReleaseIsRedundant({ version: [1, 13, 0], prerelease: 'rc3' }, [[1, 13, 2]]),
      true,
    );
  });
});
