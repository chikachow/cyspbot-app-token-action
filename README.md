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
- pnpm configuration is enforced from `package.json` and `pnpm-workspace.yaml`: the repo declares Node and pnpm versions, installs fail on a mismatched pnpm version, respect dependency `engines` metadata, fail when `node_modules` is stale for `pnpm run` and `pnpm exec`, and reject packages published less than 24 hours ago.
- Tests run on Node's built-in `node:test` runner instead of a third-party test framework.
- CI verifies that source changes still build into a release artifact and that the workflows stay valid.
- The `release` workflow determines the next stable `vX.Y.Z` from conventional commits since the highest existing release tag, then dispatches `prepare-release`.
- The `prepare-release` workflow creates a release-only commit containing `dist/index.js`, tags it with the requested release version, moves the plain compatibility tags `vX.Y` and `vX` for stable releases, and publishes a GitHub Release with generated notes.
- Consumers should pin a specific release tag or a maintained major tag such as `v1`, not `main`.

## Releasing

After changing `src/`:

1. Run `node --run check`.
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
