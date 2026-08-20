# julia-compute-test-matrix

A GitHub Action that computes a CI test matrix of Julia versions and platforms for a Julia
package, based on the `julia` compat bound in its `Project.toml` and the list of Julia
versions that [juliaup](https://github.com/JuliaLang/juliaup) can install.

The action needs a checkout of the package (to read `Project.toml`) and network access to
`julialang-s3.julialang.org` (to read the juliaup version database). It does not need a
Julia installation.

## Usage

```yaml
jobs:
  compute-test-matrix:
    runs-on: ubuntu-latest
    outputs:
      test-matrix: ${{ steps.matrix.outputs.test-matrix }}
    steps:
      - uses: actions/checkout@v6
      - uses: julia-actions/julia-compute-test-matrix@v1
        id: matrix

  test:
    needs: compute-test-matrix
    strategy:
      fail-fast: false
      matrix:
        include: ${{ fromJson(needs.compute-test-matrix.outputs.test-matrix) }}
    runs-on: ${{ matrix.os }}
    continue-on-error: ${{ matrix.allow-failure }}
    steps:
      - uses: actions/checkout@v6
      - uses: julia-actions/install-juliaup@v2
        with:
          channel: ${{ matrix.juliaup-channel }}
      # ... build and test ...
```

## Inputs

All inputs are optional.

| Input | Default | Description |
| --- | --- | --- |
| `project-path` | `.` | Directory containing the `Project.toml` (or `JuliaProject.toml`) whose `[compat]` `julia` bound is used. The package **must** declare a `julia` compat bound. |
| `include-release-versions` | `true` | Include the current Julia release version. |
| `include-lts-versions` | `true` | Include the current Julia LTS version. |
| `include-all-compatible-minor-versions` | `false` | Include the latest patch of every compatible minor version. |
| `include-smallest-compatible-minor-versions` | `true` | Include the smallest compatible minor version. |
| `include-rc-versions` | `false` | Include the `rc` channel (skipped when it resolves to a version already in the matrix). |
| `include-beta-versions` | `false` | Include the `beta` channel (skipped when it resolves to a version already in the matrix). |
| `include-alpha-versions` | `false` | Include the `alpha` channel (skipped when it resolves to a version already in the matrix). |
| `include-nightly-versions` | `false` | Include the `nightly` channel. |
| `include-windows-x64` | `true` | Include Windows x64. |
| `include-windows-x86` | `true` | Include Windows x86. |
| `include-linux-x64` | `true` | Include Linux x64. |
| `include-linux-x86` | `true` | Include Linux x86. |
| `include-macos-x64` | `true` | Include macOS x64. |
| `include-macos-aarch64` | `true` | Include macOS aarch64. |
| `allow-failure` | `rc,beta,alpha,nightly` | Globs marking legs that may fail without failing the workflow — see [Allowing legs to fail](#allowing-legs-to-fail). |

Version selections are always filtered to versions compatible with the package's `julia`
compat bound, and version/platform combinations for which juliaup has no native binary are
skipped.

## Output

`test-matrix` — a JSON array of matrix entries, intended for `strategy.matrix.include`
via `fromJson`. Each entry has:

| Key | Example | Description |
| --- | --- | --- |
| `os` | `ubuntu-latest` | GitHub runner label. One of `windows-latest`, `ubuntu-latest`, `macos-26-intel` (x64), `macos-26` (aarch64). |
| `juliaup-channel` | `1.10.10~x64` | A juliaup channel: `<version>~<arch>` for stable versions, or `<rc\|beta\|alpha\|nightly>~<arch>` for pre-release channels. Pass it to `julia-actions/install-juliaup`'s `channel` input. |
| `experimental` | `false` | `true` for pre-release channel entries. A fact about the leg, independent of whether it is allowed to fail. |
| `allow-failure` | `false` | `true` when the leg matched the `allow-failure` input. Feed it to `continue-on-error: ${{ matrix.allow-failure }}`. |

## Allowing legs to fail

Whether a leg is allowed to fail is CI policy, not a property of the leg, so it is expressed
as patterns rather than as a fixed rule over pre-release channels. `allow-failure` takes a
comma- or newline-separated list of globs (`*` is the only wildcard), each matched against the
leg's `<juliaup-channel>:<os>` identity, e.g. `rc~x64:ubuntu-latest`. Parts a pattern leaves
out are filled in with wildcards.

| Pattern | Matches |
| --- | --- |
| `rc` | every `rc` leg, on every arch and runner |
| `rc,beta,alpha,nightly` | every pre-release leg (the default) |
| `*~x86` | every 32-bit leg, stable ones included |
| `*:macos-26-intel` | every leg on the Intel macOS runner |
| `rc~x64:ubuntu-latest` | that one leg |
| `none` | nothing — every leg is blocking |

A pattern is matched literally apart from `*`, so `rc` does not match the stable version
`1.12.0-rc1~x64`.

## Development

Source lives in `src/`; the committed bundle `dist/index.js` is what the action runs.
After changing `src/`, run `npm run build` and commit the updated `dist/index.js`
(CI verifies the bundle is in sync). Run tests with `npm test`.
