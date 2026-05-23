# Repository Guide

This document describes the current structure, behavior, and maintenance expectations for `cyspbot-action`.

## Purpose

`cyspbot-action` is the reusable GitHub Action client for `cyspbot`. It exchanges a GitHub Actions OIDC token for a short-lived repository-scoped GitHub installation token.

This repository owns the workflow-facing action client only. The hosted `cyspbot` implementation lives in the separate `cyspbot` repository.

## Repository shape

- `action.yml`
  - action contract consumed by workflows
- `src/action.ts`
  - cyspbot request flow, response validation, and injectable dependencies for tests
- `src/main.ts`
  - GitHub Actions entrypoint that reports failures through `core.setFailed(...)`
- `test/action.test.ts`
  - `node:test` coverage for success, defaults, cyspbot failure, and malformed response handling
- `.github/workflows/ci.yml`
  - CI for formatting, linting, typechecking, tests, bundle verification, and `actionlint`
- `.github/workflows/prepare-release.yml`
  - dispatched release-preparation workflow that builds the bundled runtime, creates the requested release tag, updates compatibility tags, and publishes generated release notes
- `.github/workflows/release.yml`
  - manual release entrypoint that calculates the next semantic version from conventional commits since the highest existing release tag and dispatches `prepare-release`
- `tsdown.config.mjs`
  - bundler configuration for the generated release runtime artifact
- `tsconfig.json`
  - project TypeScript policy

## Runtime contract

- `action.yml` points at `dist/index.js`.
- `dist/index.js` is generated during release preparation and committed onto release-tagged commits, not onto `main`.
- The runtime artifact stays self-contained. Consumers do not install this repository's dependencies at action execution time.
- The action exposes `token` and `expires_at` outputs and accepts `audience` and `cyspbot-url` inputs.
- `main` is the source branch, not a supported consumer ref for `uses:`.
- `vX.Y.Z` tags are GitHub Release tags created by the release workflows.
- `vX.Y` and `vX` tags are compatibility tags without corresponding GitHub Releases, so they move forward to the latest compatible stable release commit.

## Development workflow

Use:

```bash
pnpm install
node --run check
```

Before publishing a change:

```bash
node --run check
gh workflow run release.yml
```

Release bump rules:

- for `v1+`, `feat:` bumps the minor version, `fix:` and `perf:` bump the patch version, and any conventional commit header with `!:` such as `type!:` or `type(scope)!:`, or a `BREAKING CHANGE:` footer, bumps the major version
- for `v0`, breaking changes bump the minor version, and changes that would otherwise bump minor or patch only bump the patch version
- automated releases stay on major version `0` until a later version is chosen manually
- set `prerelease=true` on `release.yml` to publish `vX.Y.Z-rc.N`; only the `rc` prerelease channel is supported
- prereleases do not move the compatibility tags `vX.Y` and `vX`
- other commit types do not trigger a release on their own

## Tooling posture

- TypeScript extends `@tsconfig/recommended`, `@tsconfig/node24`, and `@tsconfig/strictest`.
- Local `tsconfig.json` overrides are intentionally narrow and repo-specific.
- Full typechecking runs with `skipLibCheck: false`.
- `package.json` and `pnpm-workspace.yaml` enforce package-manager policy: declare the supported Node and pnpm versions, fail on a pnpm version mismatch, honor dependency `engines` constraints, fail when `pnpm run` or `pnpm exec` would use stale `node_modules`, and require package releases to be at least 24 hours old.
- `tsdown` emits `dist/index.js` as a bundled ESM artifact because the action targets the Node 24 runtime and the repository already uses an ESM package boundary.
- The action source stays authored as modern NodeNext-style TypeScript, while the generated `dist/` artifact absorbs the GitHub Actions runtime compatibility requirement.
- Tests run directly on the built-in `node:test` runner against the `.ts` sources.

## Why this repository uses a JavaScript action

The logic is small, but a JavaScript action is the right fit here because it gives:

- direct use of `@actions/core.getIDToken(...)`
- unit-testable behavior without shell-heavy mocks
- a stable bundled runtime artifact in `dist/`
- less workflow-specific shell quoting risk in consuming repositories

## Maintenance expectations

1. Keep `node --run check` green so release preparation can generate `dist/index.js` from source without manual fixes.
2. Keep examples aligned with the inputs and outputs declared in `action.yml`.
3. Keep `cyspbot` implementation details in the `cyspbot` repository, not here.
4. Keep the action self-contained. Do not introduce runtime dependence on consumer-side `node_modules`.
5. Preserve the current response validation behavior: cyspbot responses must be JSON objects with string `token` and `expires_at` properties.
6. Treat release preparation as the point where `dist/index.js` becomes part of the public contract.
7. Do not create GitHub Releases for the movable `vX.Y` or `vX` compatibility tags.

## Consumer example

```yaml
permissions:
  contents: write
  id-token: write
  pull-requests: write

steps:
  - uses: cysp/cyspbot-action@v1
    id: cyspbot

  - uses: peter-evans/create-pull-request@v8
    with:
      token: ${{ steps.cyspbot.outputs.token }}
```

## Ownership boundary

- `cyspbot-action` owns the reusable workflow-facing client.
- `cyspbot` owns the hosted service implementation and deployment.
