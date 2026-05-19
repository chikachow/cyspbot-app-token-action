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
  - manual release workflow that builds the bundled runtime, creates the immutable release tag, and updates compatibility tags
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
- `vX.Y.Z` tags are GitHub Release tags and are intended to stay immutable.
- `vX.Y` and `vX` tags are compatibility tags without corresponding GitHub Releases, so they can move forward to the latest compatible release commit.

## Development workflow

Use:

```bash
pnpm install
node --run check
```

Before publishing a change:

```bash
node --run check
gh workflow run prepare-release.yml -f version=v1.2.3 -f prerelease=false
```

## Tooling posture

- TypeScript extends `@tsconfig/recommended`, `@tsconfig/node24`, and `@tsconfig/strictest`.
- Local `tsconfig.json` overrides are intentionally narrow and repo-specific.
- Full typechecking runs with `skipLibCheck: false`.
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
