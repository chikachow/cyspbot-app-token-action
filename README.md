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

- `audience`
  - GitHub Actions OIDC audience for the cyspbot service
  - default: `cyspbot`
- `cyspbot-token-url`
  - HTTPS token exchange endpoint URL for the cyspbot service
  - default: `https://cyspbot.chikachow.org/token`
- `resource`
  - optional GitHub repository API URI override, such as `https://api.github.com/repos/owner/repo`
  - default: `https://api.github.com/repos/${GITHUB_REPOSITORY}`
- `scope`
  - space-delimited GitHub App permission scopes, such as `contents:write pull_requests:write`
  - default: `contents:write pull_requests:write`

The action requires an HTTPS `cyspbot-token-url`. It requests a GitHub Actions OIDC token whose audience is the `audience` input. For the hosted cyspbot service, this audience must be `cyspbot`. The action does not send an RFC 8693 token-exchange `audience` form field; cyspbot uses `resource` as the issued-token target.

Every token exchange request includes `resource` and `scope`. When `resource` is blank, the action derives `https://api.github.com/repos/${GITHUB_REPOSITORY}` from the GitHub Actions runtime. If `GITHUB_REPOSITORY` is unavailable, callers must provide `resource`. When `scope` is blank, the action sends `contents:write pull_requests:write`. Explicit non-blank `resource` and `scope` inputs are trimmed and forwarded to cyspbot for service-owned token request and policy validation.

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
