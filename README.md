# cyspbot-app-token-action

`cyspbot-app-token-action` is the reusable GitHub Action that obtains a short-lived repository-scoped GitHub App installation token from `cyspbot.chikachow.org` using GitHub Actions OIDC.

This repository contains the action client. The hosted `cyspbot` service lives in the separate `cyspbot` repository.

## Usage

Workflows that use this action must grant `id-token: write`.
Consumers should use a compatibility tag such as `v0`, not `main`.

```yaml
permissions:
  id-token: write

steps:
  - name: Mint repository installation token
    id: cyspbot
    uses: chikachow/cyspbot-app-token-action@v0
```

Outputs:

- `token`
- `expires_at`
- `scope`

Inputs:

- `resource`
  - optional canonical GitHub repository API URI, such as `https://api.github.com/repos/owner/repo`
- `scope`
  - optional space-delimited GitHub App permission scopes, such as `contents:write pull_requests:write`

The action talks to the hosted cyspbot service at `https://cyspbot.chikachow.org/token`. It requests a GitHub Actions OIDC token for cyspbot's fixed service audience, `cyspbot`. The action does not send a token-exchange `audience` parameter; current cyspbot rejects non-empty `audience` form fields.

When `resource` or `scope` are omitted, cyspbot applies its service defaults for the verified workflow principal. Blank values are treated as omitted by the action. Non-blank `resource` and `scope` values are forwarded to cyspbot for service-owned token request and policy validation. The `scope` output is the canonical permission scope that cyspbot actually issued, including when the request used defaults.

Example use with `peter-evans/create-pull-request`:

```yaml
permissions:
  contents: write
  id-token: write
  pull-requests: write

steps:
  - uses: chikachow/cyspbot-app-token-action@v0
    id: cyspbot
    with:
      scope: contents:write pull_requests:write

  - uses: peter-evans/create-pull-request@v8
    with:
      token: ${{ steps.cyspbot.outputs.token }}
```

## Documentation

- For repository structure and maintenance boundaries, see [`docs/REPOSITORY.md`](docs/REPOSITORY.md).
- For local development, release workflow, and engineering conventions, see [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).
