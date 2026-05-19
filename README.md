# cyspbot-action

`cyspbot-action` is the reusable GitHub Action that obtains a short-lived repository-scoped GitHub installation token from `cyspbot.chikachow.org` using GitHub Actions OIDC.

This repository contains the action client. The hosted `cyspbot` service lives in the separate `cyspbot` repository.

## Usage

Workflows that use this action must grant `id-token: write`.
Consumers should use a release tag such as `v1`, not `main`.

```yaml
permissions:
  id-token: write

steps:
  - name: Mint repository installation token
    id: cyspbot
    uses: cysp/cyspbot-action@v1
```

Outputs:

- `token`
- `expires_at`

Inputs:

- `audience`
  - default: `cyspbot`
- `cyspbot-url`
  - default: `https://cyspbot.chikachow.org`

Example use with `peter-evans/create-pull-request`:

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

## Development

This repository contains:

- `src/`
  - TypeScript source for the action client
- `dist/`
  - the generated self-contained runtime artifact published onto release tags
- `test/`
  - unit tests for cyspbot request and response handling using the built-in `node:test` runner

Common commands:

```bash
pnpm install
node --run test
node --run bundle
node --run check
```

`node --run check` verifies:

- formatting
- lint
- typecheck
- tests
- the release bundle still builds from source

## Best practices adopted here

- The action uses GitHub’s OIDC support through `@actions/core.getIDToken(...)` instead of manually reading undocumented internals.
- The runtime artifact is bundled into `dist/index.js` on release publication, so consumers do not depend on install steps or runtime `node_modules` resolution.
- The bundle is built with `tsdown`, configured to keep the GitHub Action artifact self-contained even though `tsdown` defaults are library-oriented.
- TypeScript extends `@tsconfig/recommended`, `@tsconfig/node24`, and `@tsconfig/strictest`, with local overrides only for repo-specific concerns such as test-time `.ts` imports and full library typechecking.
- Tests run on Node's built-in `node:test` runner instead of a third-party test framework.
- CI verifies that source changes still build into a release artifact and that the workflows stay valid.
- The `prepare-release` workflow creates a release-only commit containing `dist/index.js`, tags it as an immutable `vX.Y.Z` release, and then moves the plain compatibility tags `vX.Y` and `vX` for stable releases.
- Consumers should pin immutable refs or a maintained major tag such as `v1`, not `main`.

## Releasing

After changing `src/`:

1. Run `node --run check`.
2. Run the `prepare-release` workflow with a version such as `v1.2.3`.
3. Let the workflow build `dist/index.js`, create the release-only commit, push the immutable `v1.2.3` tag, move the matching `v1.2` and `v1` tags for stable releases, and publish the GitHub release.

`v1.2.3` is the immutable GitHub Release tag.
`v1.2` and `v1` are movable Git tags only, so they are not locked by release immutability.
