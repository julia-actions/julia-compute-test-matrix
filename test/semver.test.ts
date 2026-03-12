import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { parseSemverSpec, satisfies, VersionTriple } from '../src/semver';

function check(specStr: string, version: VersionTriple, expected: boolean): void {
  const spec = parseSemverSpec(specStr);
  assert.strictEqual(
    satisfies(version, spec),
    expected,
    `satisfies([${version}], "${specStr}") should be ${expected}`
  );
}

describe('caret specifier (default)', () => {
  it('"1.6" matches [1.6.0, 2.0.0)', () => {
    check('1.6', [1, 6, 0], true);
    check('1.6', [1, 6, 7], true);
    check('1.6', [1, 7, 0], true);
    check('1.6', [1, 12, 5], true);
    check('1.6', [1, 5, 4], false);
    check('1.6', [2, 0, 0], false);
    check('1.6', [0, 9, 0], false);
  });

  it('"1" matches [1.0.0, 2.0.0)', () => {
    check('1', [1, 0, 0], true);
    check('1', [1, 0, 5], true);
    check('1', [1, 12, 5], true);
    check('1', [0, 9, 0], false);
    check('1', [2, 0, 0], false);
  });

  it('"1.6.3" matches [1.6.3, 2.0.0)', () => {
    check('1.6.3', [1, 6, 3], true);
    check('1.6.3', [1, 6, 7], true);
    check('1.6.3', [1, 12, 5], true);
    check('1.6.3', [1, 6, 2], false);
    check('1.6.3', [2, 0, 0], false);
  });

  it('"^1.6" is the same as "1.6"', () => {
    check('^1.6', [1, 6, 0], true);
    check('^1.6', [1, 12, 5], true);
    check('^1.6', [1, 5, 4], false);
    check('^1.6', [2, 0, 0], false);
  });

  it('"0.6" matches [0.6.0, 0.7.0)', () => {
    check('0.6', [0, 6, 0], true);
    check('0.6', [0, 6, 5], true);
    check('0.6', [0, 7, 0], false);
    check('0.6', [1, 0, 0], false);
  });

  it('"0.0.3" matches [0.0.3, 0.0.4)', () => {
    check('0.0.3', [0, 0, 3], true);
    check('0.0.3', [0, 0, 4], false);
    check('0.0.3', [0, 0, 2], false);
  });

  it('"0.0" matches [0.0.0, 0.1.0)', () => {
    check('0.0', [0, 0, 0], true);
    check('0.0', [0, 0, 5], true);
    check('0.0', [0, 1, 0], false);
  });
});

describe('tilde specifier', () => {
  it('"~1.6" matches [1.6.0, 1.7.0)', () => {
    check('~1.6', [1, 6, 0], true);
    check('~1.6', [1, 6, 7], true);
    check('~1.6', [1, 7, 0], false);
    check('~1.6', [1, 5, 0], false);
  });

  it('"~1.6.3" matches [1.6.3, 1.7.0)', () => {
    check('~1.6.3', [1, 6, 3], true);
    check('~1.6.3', [1, 6, 7], true);
    check('~1.6.3', [1, 6, 2], false);
    check('~1.6.3', [1, 7, 0], false);
  });

  it('"~1" matches [1.0.0, 2.0.0)', () => {
    check('~1', [1, 0, 0], true);
    check('~1', [1, 12, 5], true);
    check('~1', [2, 0, 0], false);
  });
});

describe('equality specifier', () => {
  it('"= 1.6" matches [1.6.0, 1.7.0)', () => {
    check('= 1.6', [1, 6, 0], true);
    check('= 1.6', [1, 6, 7], true);
    check('= 1.6', [1, 7, 0], false);
    check('= 1.6', [1, 5, 0], false);
  });

  it('"= 1.6.7" matches only 1.6.7', () => {
    check('= 1.6.7', [1, 6, 7], true);
    check('= 1.6.7', [1, 6, 8], false);
    check('= 1.6.7', [1, 6, 6], false);
  });
});

describe('inequality specifiers', () => {
  it('">= 1.6" matches 1.6.0+', () => {
    check('>= 1.6', [1, 6, 0], true);
    check('>= 1.6', [1, 12, 5], true);
    check('>= 1.6', [1, 5, 4], false);
    check('>= 1.6', [0, 9, 0], false);
  });

  it('">=1.6" (no space) also works', () => {
    check('>=1.6', [1, 6, 0], true);
    check('>=1.6', [1, 5, 4], false);
  });

  it('"> 1.6" matches 1.7.0+ (exclusive of 1.6.x)', () => {
    check('> 1.6', [1, 7, 0], true);
    check('> 1.6', [1, 6, 7], false);
    check('> 1.6', [1, 6, 0], false);
  });

  it('"< 1.6" matches below 1.6.0', () => {
    check('< 1.6', [1, 5, 4], true);
    check('< 1.6', [1, 0, 5], true);
    check('< 1.6', [1, 6, 0], false);
    check('< 1.6', [1, 6, 7], false);
  });

  it('"<= 1.6" matches up to 1.6.x', () => {
    check('<= 1.6', [1, 6, 0], true);
    check('<= 1.6', [1, 6, 7], true);
    check('<= 1.6', [1, 7, 0], false);
    check('<= 1.6', [1, 5, 4], true);
  });
});

describe('hyphen range', () => {
  it('"1.6 - 1.10" matches [1.6.0, 1.11.0)', () => {
    check('1.6 - 1.10', [1, 6, 0], true);
    check('1.6 - 1.10', [1, 6, 7], true);
    check('1.6 - 1.10', [1, 8, 5], true);
    check('1.6 - 1.10', [1, 10, 10], true);
    check('1.6 - 1.10', [1, 11, 0], false);
    check('1.6 - 1.10', [1, 5, 4], false);
  });

  it('"1.6.0 - 1.10.5" matches [1.6.0, 1.10.6)', () => {
    check('1.6.0 - 1.10.5', [1, 6, 0], true);
    check('1.6.0 - 1.10.5', [1, 10, 5], true);
    check('1.6.0 - 1.10.5', [1, 10, 6], false);
    check('1.6.0 - 1.10.5', [1, 5, 4], false);
  });
});

describe('comma-separated union', () => {
  it('"1.6, 1.8" matches ^1.6 OR ^1.8 (both are subsets of [1.6, 2.0))', () => {
    check('1.6, 1.8', [1, 6, 7], true);
    check('1.6, 1.8', [1, 8, 5], true);
    check('1.6, 1.8', [1, 7, 3], true);
    check('1.6, 1.8', [1, 5, 4], false);
    check('1.6, 1.8', [2, 0, 0], false);
  });

  it('"~1.6, ~1.10" matches 1.6.x OR 1.10.x', () => {
    check('~1.6, ~1.10', [1, 6, 7], true);
    check('~1.6, ~1.10', [1, 10, 10], true);
    check('~1.6, ~1.10', [1, 7, 0], false);
    check('~1.6, ~1.10', [1, 9, 4], false);
  });
});

describe('real-world compat strings against all 13 Julia versions', () => {
  const allVersions: VersionTriple[] = [
    [1, 0, 5], [1, 1, 1], [1, 2, 0], [1, 3, 1], [1, 4, 2],
    [1, 5, 4], [1, 6, 7], [1, 7, 3], [1, 8, 5], [1, 9, 4],
    [1, 10, 10], [1, 11, 9], [1, 12, 5],
  ];

  function matchingVersions(specStr: string): string[] {
    const spec = parseSemverSpec(specStr);
    return allVersions.filter(v => satisfies(v, spec)).map(v => `${v[0]}.${v[1]}.${v[2]}`);
  }

  it('"1.6" includes 1.6.7 through 1.12.5', () => {
    assert.deepStrictEqual(matchingVersions('1.6'), [
      '1.6.7', '1.7.3', '1.8.5', '1.9.4', '1.10.10', '1.11.9', '1.12.5',
    ]);
  });

  it('"1.10" includes 1.10.10 through 1.12.5', () => {
    assert.deepStrictEqual(matchingVersions('1.10'), [
      '1.10.10', '1.11.9', '1.12.5',
    ]);
  });

  it('"1" includes all versions', () => {
    assert.strictEqual(matchingVersions('1').length, 13);
  });

  it('"~1.6" includes only 1.6.7', () => {
    assert.deepStrictEqual(matchingVersions('~1.6'), ['1.6.7']);
  });

  it('"1.6 - 1.10" includes 1.6.7 through 1.10.10', () => {
    assert.deepStrictEqual(matchingVersions('1.6 - 1.10'), [
      '1.6.7', '1.7.3', '1.8.5', '1.9.4', '1.10.10',
    ]);
  });

  it('">= 1.8" includes 1.8.5+', () => {
    assert.deepStrictEqual(matchingVersions('>= 1.8'), [
      '1.8.5', '1.9.4', '1.10.10', '1.11.9', '1.12.5',
    ]);
  });
});
