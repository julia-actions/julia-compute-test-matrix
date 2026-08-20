import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { isAllowFailure, parseAllowFailurePatterns } from '../src/allowFailure';

function matches(raw: string, channel: string, os: string): boolean {
  return isAllowFailure(channel, os, parseAllowFailurePatterns(raw));
}

const DEFAULT = 'rc,beta,alpha,nightly';

describe('parseAllowFailurePatterns', () => {
  it('splits on commas and newlines and trims', () => {
    assert.deepStrictEqual(parseAllowFailurePatterns(' rc, beta \n nightly '), ['rc', 'beta', 'nightly']);
  });

  it('drops empty entries', () => {
    assert.deepStrictEqual(parseAllowFailurePatterns('rc,,\n,beta'), ['rc', 'beta']);
  });

  it('treats "none" as the empty set', () => {
    assert.deepStrictEqual(parseAllowFailurePatterns('none'), []);
    assert.deepStrictEqual(parseAllowFailurePatterns('  NONE \n'), []);
  });

  it('does not treat "none" alongside other patterns as the empty set', () => {
    assert.deepStrictEqual(parseAllowFailurePatterns('none,rc'), ['none', 'rc']);
  });

  it('yields the empty set for an empty string', () => {
    assert.deepStrictEqual(parseAllowFailurePatterns(''), []);
  });
});

describe('the default pattern set', () => {
  it('covers every pre-release channel on every runner', () => {
    for (const channel of ['rc', 'beta', 'alpha', 'nightly']) {
      for (const [ch, os] of [
        [`${channel}~x64`, 'ubuntu-latest'],
        [`${channel}~x86`, 'windows-latest'],
        [`${channel}~aarch64`, 'macos-26'],
      ]) {
        assert.ok(matches(DEFAULT, ch, os), `${ch}:${os} should be allowed to fail`);
      }
    }
  });

  it('leaves stable versions blocking', () => {
    assert.strictEqual(matches(DEFAULT, '1.10.5~x64', 'ubuntu-latest'), false);
    assert.strictEqual(matches(DEFAULT, '1.6.7~x86', 'windows-latest'), false);
  });

  it('does not match a version that merely contains a channel name', () => {
    assert.strictEqual(matches(DEFAULT, '1.12.0-rc1~x64', 'ubuntu-latest'), false);
  });
});

describe('glob patterns', () => {
  it('matches an arch across every channel and runner', () => {
    assert.ok(matches('*~x86', '1.10.5~x86', 'windows-latest'));
    assert.ok(matches('*~x86', 'rc~x86', 'ubuntu-latest'));
    assert.strictEqual(matches('*~x86', '1.10.5~x64', 'windows-latest'), false);
  });

  it('matches a runner across every channel', () => {
    assert.ok(matches('*:macos-26-intel', '1.10.5~x64', 'macos-26-intel'));
    assert.strictEqual(matches('*:macos-26-intel', '1.10.5~x64', 'macos-26'), false);
  });

  it('matches a fully spelled-out leg identity', () => {
    assert.ok(matches('rc~x64:ubuntu-latest', 'rc~x64', 'ubuntu-latest'));
    assert.strictEqual(matches('rc~x64:ubuntu-latest', 'rc~x64', 'windows-latest'), false);
  });

  it('combines channel sugar with explicit globs', () => {
    assert.ok(matches('rc,*~x86', '1.10.5~x86', 'ubuntu-latest'));
    assert.ok(matches('rc,*~x86', 'rc~aarch64', 'macos-26'));
    assert.strictEqual(matches('rc,*~x86', '1.10.5~x64', 'ubuntu-latest'), false);
  });

  it('treats regex metacharacters as literals', () => {
    assert.strictEqual(matches('1.10.5~x64', '1x10x5~x64', 'ubuntu-latest'), false);
    assert.ok(matches('1.10.5~x64', '1.10.5~x64', 'ubuntu-latest'));
  });

  it('allows nothing when the set is empty', () => {
    assert.strictEqual(matches('none', 'nightly~x64', 'ubuntu-latest'), false);
    assert.strictEqual(matches('', 'nightly~x64', 'ubuntu-latest'), false);
  });
});
