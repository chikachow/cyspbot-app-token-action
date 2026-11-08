#!/usr/bin/env bash
set -euo pipefail

if [[ ! "${VERSION}" =~ ^v([0-9]+)\.([0-9]+)\.([0-9]+)(-rc\.([0-9]+))?$ ]]; then
  echo "Expected VERSION like v1.2.3 or v1.2.3-rc.1, got ${VERSION}" >&2
  exit 1
fi

# Preparation owns this decision for both release dispatch and direct dispatch.
tags="$(git tag --list --sort=-version:refname)"
previous_tag="$(grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' <<<"${tags}" | head -n 1 || true)"
if [[ "${VERSION}" == *-rc.* ]]; then
  version_core="${VERSION%-rc.*}"
  previous_rc="$(grep -E '^v[0-9]+\.[0-9]+\.[0-9]+-rc\.[0-9]+$' <<<"${tags}" | grep -F "${version_core}-rc." | head -n 1 || true)"
  if [[ -n "${previous_rc}" ]]; then
    previous_tag="${previous_rc}"
  fi
fi

if [[ -z "${previous_tag}" ]]; then
  echo "No previous release on this channel; allowing the first release"
  exit 0
fi

# Fail on missing artifacts instead of interpreting a failed read as a change.
previous_bundle="$(git rev-parse --verify "refs/tags/${previous_tag}:dist/index.js")"
previous_action="$(git rev-parse --verify "refs/tags/${previous_tag}:action.yml")"
current_bundle="$(git hash-object dist/index.js)"
current_action="$(git hash-object action.yml)"
if [[ "${previous_bundle}" == "${current_bundle}" && "${previous_action}" == "${current_action}" ]]; then
  echo "No action artifact changes detected since ${previous_tag}" >&2
  exit 1
fi

echo "Action artifact differs from ${previous_tag}"
