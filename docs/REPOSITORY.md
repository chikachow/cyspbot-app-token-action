# Repository Guide

This document describes the current structure, behavior, and maintenance expectations for `cyspbot-app-token-action`.

## Purpose

`cyspbot-app-token-action` is the reusable GitHub Action client for `cyspbot`. It exchanges a GitHub Actions OIDC token for a short-lived repository-scoped GitHub App installation token.

This repository owns the workflow-facing action client only. The hosted `cyspbot` implementation lives in the separate `cyspbot` repository.

For local development, release steps, and tooling conventions, see [`DEVELOPMENT.md`](DEVELOPMENT.md).

## Repository shape

- `action.yml`
  - action contract consumed by workflows
- `src/action.ts`
  - cyspbot OAuth token-exchange request flow, response validation, and injectable dependencies for tests
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
- The action exposes `token` and `expires_at` outputs and accepts `github-app`, `cyspbot-url`, `resource`, and `scope` inputs.
- Blank `github-app` defaults to `cyspbot`; the action sends it as cyspbot's `github_app` token endpoint extension parameter. The GitHub Actions OIDC token is always requested with cyspbot's internal service audience, `cyspbot`. Blank `resource` and `scope` inputs are omitted from the token exchange request. Non-blank `github-app` values are trimmed and locally validated for GitHub App slug shape before requesting an OIDC token. Non-blank `resource` and `scope` values are trimmed and forwarded to cyspbot for service-owned token request and policy validation.
- Blank `cyspbot-url` defaults to `https://cyspbot.chikachow.org`; non-blank values are trimmed and must use HTTPS. The action posts an `application/x-www-form-urlencoded` OAuth token-exchange request to `/token` with a 10-second timeout.
- `main` is the source branch, not a supported consumer ref for `uses:`.
- `vX.Y.Z` tags are GitHub Release tags created by the release workflows.
- `vX.Y` and `vX` tags are compatibility tags without corresponding GitHub Releases, so they move forward to the latest compatible stable release commit.

## Why this repository uses a JavaScript action

The logic is small, but a JavaScript action is the right fit here because it gives:

- direct use of `@actions/core.getIDToken(...)`
- unit-testable behavior without shell-heavy mocks
- a stable bundled runtime artifact in `dist/`
- less workflow-specific shell quoting risk in consuming repositories

## Maintenance expectations

1. Keep `pnpm run check` green so release preparation can generate `dist/index.js` from source without manual fixes.
2. Keep examples aligned with the inputs and outputs declared in `action.yml`.
3. Keep `cyspbot` implementation details in the `cyspbot` repository, not here.
4. Keep the action self-contained. Do not introduce runtime dependence on consumer-side `node_modules`.
5. Preserve strict response validation: cyspbot `/token` responses must be JSON objects with string `access_token`, integer `expires_in`, the expected GitHub installation token type, and `token_type: Bearer`.
6. Treat release preparation as the point where `dist/index.js` becomes part of the public contract.
7. Do not create GitHub Releases for the movable `vX.Y` or `vX` compatibility tags.

## Consumer example

```yaml
permissions:
  contents: write
  id-token: write
  pull-requests: write

steps:
  - uses: chikachow/cyspbot-app-token-action@v0.0.3
    id: cyspbot
    with:
      scope: contents:write pull_requests:write

  - uses: peter-evans/create-pull-request@v8
    with:
      token: ${{ steps.cyspbot.outputs.token }}
```

## Ownership boundary

- `cyspbot-app-token-action` owns the reusable workflow-facing client.
- `cyspbot` owns the hosted service implementation and deployment.
