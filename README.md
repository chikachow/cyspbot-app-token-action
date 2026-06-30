# cyspbot-app-token-action

`cyspbot-app-token-action` is the reusable GitHub Action that obtains a short-lived repository-scoped GitHub App installation token from `cyspbot.chikachow.org` using GitHub Actions OIDC.

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
    uses: chikachow/cyspbot-app-token-action@v0.0.3
```

Outputs:

- `token`
- `expires_at`

Inputs:

- `audience`
  - canonical GitHub App URL, such as `https://github.com/apps/cyspbot`
  - default: `https://github.com/apps/cyspbot`
- `cyspbot-url`
  - HTTPS base URL for the cyspbot service
  - default: `https://cyspbot.chikachow.org`
- `resource`
  - optional canonical GitHub repository API URI, such as `https://api.github.com/repos/owner/repo`
- `scope`
  - optional space-delimited GitHub App permission scopes, such as `contents:write pull_requests:write`

The action requires an HTTPS `cyspbot-url`. It requests a GitHub Actions OIDC token whose audience is the `audience` input and sends the same value as the token-exchange `audience`. When `resource` or `scope` are omitted, cyspbot applies its service defaults for the verified workflow principal. Blank values are treated as omitted by the action. Non-blank `audience` values are validated locally for canonical GitHub App URL shape before requesting an OIDC token. Non-blank `resource` and `scope` values are forwarded to cyspbot for service-owned token request and policy validation.

Example use with `peter-evans/create-pull-request`:

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

## Documentation

- For repository structure and maintenance boundaries, see [`docs/REPOSITORY.md`](docs/REPOSITORY.md).
- For local development, release workflow, and engineering conventions, see [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).
