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

- `github-app`
  - GitHub App slug to request from cyspbot, such as `cyspbot`
  - default: `cyspbot`
- `cyspbot-url`
  - HTTPS base URL for the cyspbot service
  - default: `https://cyspbot.chikachow.org`
- `resource`
  - optional canonical GitHub repository API URI, such as `https://api.github.com/repos/owner/repo`
- `scope`
  - optional space-delimited GitHub App permission scopes, such as `contents:write pull_requests:write`

The action requires an HTTPS `cyspbot-url`. It requests a GitHub Actions OIDC token for the internal cyspbot audience `cyspbot`, and sends the `github-app` input as cyspbot's `github_app` token endpoint extension parameter. When `resource` or `scope` are omitted, cyspbot applies its service defaults for the verified workflow principal. Blank values are treated as omitted by the action. Non-blank `github-app` values are validated locally for GitHub App slug shape before requesting an OIDC token. Non-blank `resource` and `scope` values are forwarded to cyspbot for service-owned token request and policy validation.

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
