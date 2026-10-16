# Development Guide

This document covers local development, release workflow, and engineering conventions for `cyspbot-app-token-action`.

For repository structure, runtime contract, and ownership boundaries, see [`REPOSITORY.md`](REPOSITORY.md).

## Repository contents

- `src/`
  - TypeScript source for the action client
- `dist/`
  - generated self-contained runtime artifact published onto release tags
- `test/`
  - unit tests for cyspbot request and response handling using the built-in `node:test` runner

## Common commands

Install the [pinned pnpm version](#dependency-tooling) first.

```bash
pnpm install
pnpm run test
pnpm run bundle
pnpm run check
```

`pnpm run check` verifies:

- frozen manifest/lockfile consistency, strict peer requirements, and deduplication
- formatting
- lint
- typecheck
- tests
- the release bundle still builds from source

See [dependency tooling](#dependency-tooling) for the dependency update policy
and validation gates.

## Engineering conventions

- The action uses GitHub's OIDC support through `@actions/core.getIDToken(...)` instead of manually reading undocumented internals.
- The runtime artifact is bundled into `dist/index.js` on release publication, so consumers do not depend on install steps or runtime `node_modules` resolution.
- The bundle is built with `tsdown`, configured to keep the GitHub Action artifact self-contained even though `tsdown` defaults are library-oriented.
- TypeScript extends `@tsconfig/recommended`, `@tsconfig/node24`, and `@tsconfig/strictest`, with local overrides only for repo-specific concerns such as test-time `.ts` imports and full library typechecking.
- Dependency tooling follows the policy below; the exact pnpm version comes from `packageManager`.
- Tests run on Node's built-in `node:test` runner instead of a third-party test framework.
- CI verifies that source changes still build into a release artifact and that the workflows stay valid.
- The `release` workflow determines the next stable `vX.Y.Z` from conventional commits since the highest existing release tag, then dispatches `prepare-release`.
- The `prepare-release` workflow creates a release-only commit containing `dist/index.js`, tags it with the requested release version, moves the plain compatibility tags `vX.Y` and `vX` for stable releases, and publishes a GitHub Release with generated notes.
- Consumers should pin a specific release tag or a maintained compatibility tag such as `v0`, not `main`.

## Publishing a change

Before publishing a change:

```bash
pnpm run check
gh workflow run release.yml
```

## Releasing

After changing `src/`:

1. Run `pnpm run check`.
2. Use conventional commits for releasable changes:
   - for `v1+`, `feat:` bumps the minor version, `fix:`, `perf:`, and `chore:` bump the patch version, and any conventional commit header with `!:` such as `type!:` or `type(scope)!:`, or a `BREAKING CHANGE:` footer, bumps the major version
   - for `v0`, breaking changes bump the minor version, and changes that would otherwise bump minor or patch only bump the patch version
   - automated releases stay on major version `0` until you manually move beyond it
3. Run the `release` workflow from `main`.
   - Leave `prerelease=false` for a stable `vX.Y.Z` release.
   - Set `prerelease=true` to publish `vX.Y.Z-rc.N` on the single supported `rc` channel.
4. Let the workflows determine the next version, build `dist/index.js`, create the release-only commit, push the release tag, move the matching `vX.Y` and `vX` tags for stable releases only, and publish the GitHub release with generated notes.

`v1.2.3` is the stable release tag.
`v1.2.3-rc.1` is an `rc` prerelease tag.
`v1.2` and `v1` are compatibility tags that move forward on stable releases.

## Dependency tooling

Use Node 24 and the exact pnpm version in `packageManager`. Install it from the
repository root, then verify it before installing dependencies. When migrating
an existing Corepack installation, run `corepack disable pnpm` once first to
remove its pnpm shims.

```bash
npm install --global "$(node -p 'require("./package.json").packageManager')"
node --run pnpm:check
pnpm install --frozen-lockfile
```

CI installs the manifest pin with `pnpm/action-setup`. The local `check` command
retains the version guard for developer environments. `pmOnFail: ignore` keeps
the lockfile as one YAML document for GitHub's dependency graph; direct pnpm commands do not automatically select or enforce the
pin. Adding config dependencies requires reviewing that compatibility assumption.

Dependency updates permit intermediate peer conflicts with automatic peer
installation disabled. `peer-dependencies:check` runs `pnpm peers check` without
changing the lockfile; a frozen install alone is insufficient.
`dedupe:check` fails when pnpm could consolidate the lockfile without editing it.
Run `pnpm dedupe --ignore-scripts` to apply deduplication and review the result.
CI rejects lockfile changes produced by validation. Node declarations stay on
Node 24, and Dependabot leaves major upgrades for the runtime upgrade.

`autoDedupe` consolidates compatible resolutions during updates, including across
workspace projects outside a command's filter. Frozen installs leave the graph
unchanged; `lockfile.includeResolutionSettings` records the selected deduplication
and linking settings.
`verifyDepsBeforeRun: error` stops pnpm scripts when dependencies are stale; it
does not guard `node --run`, so install explicitly before validation.

Dependency resolution uses a three-day release age, aligned with npm Dependabot
cooldown where configured. Frozen installs also verify lockfile supply-chain
policy. Dependency build scripts require explicit `allowBuilds` decisions;
`strictDepBuilds` rejects unreviewed builds.
