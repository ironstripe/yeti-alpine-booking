# Plan: CI workflow revision — visible lint + package-source reachability test

The implementation creates exactly one new file, `.github/workflows/ci.yml`, written in full from this plan (no other files touched). The workflow never deploys, publishes, uses secrets, runs migrations or calls backend/test functions.

## 1. Path, triggers, privileges, setup

- Single new file: `.github/workflows/ci.yml`. Any sandbox-only draft at that path is overwritten by the full content defined here.
- Triggers: `pull_request`, `push` to `main`, `workflow_dispatch`.
- Privileges: workflow-level `permissions: contents: read`; checkout with `persist-credentials: false`; no `secrets.*`, no environments, no caching, no artifacts.
- Setup: `actions/setup-node` with `node-version-file: .nvmrc` (22), `oven-sh/setup-bun` with `bun-version: 1.3.3`; all actions pinned to commit SHAs.

## 2. Hard gates (job fails if either fails)

1. `bun install --frozen-lockfile`
2. `bun run build`
3. `git diff --exit-code` (lockfile/tree unchanged)

## 3. Lint: visible, non-blocking

Separate job `lint` (after install in its own fresh runner), so a lint failure never masks install/build status:

```yaml
lint:
  runs-on: ubuntu-24.04
  continue-on-error: true      # job shown with warning, workflow stays green
  steps: [checkout, setup-node, setup-bun, bun install --frozen-lockfile]
  - name: Lint (non-blocking, pre-existing debt)
    run: bun run lint 2>&1 | tee lint.log; echo "LINT_EXIT=${PIPESTATUS[0]}"
  - name: Lint summary
    if: always()
    run: |
      echo "## Lint (non-blocking)" >> "$GITHUB_STEP_SUMMARY"
      tail -n 5 lint.log >> "$GITHUB_STEP_SUMMARY"
```

Full output stays in the step log; the error/warning count is written to the run summary. Exit to blocking later = remove `continue-on-error` once debt is at zero (separate task).

## 4. Internal package cache — transparent reachability test

`bun.lock` lines 390/392 pull `@lovable.dev/vite-plugin-dev-server-bridge@1.3.2` and `@lovable.dev/vite-plugin-hmr-gate@1.8.0` from `europe-west4-npm.pkg.dev/lovable-core-prod/sandbox-npm-cache`.

Add a diagnostic step before install in the `build` job:

```yaml
- name: Package source reachability (diagnostic)
  run: |
    for u in $(grep -o 'https://europe-west4-npm.pkg.dev[^"]*\.tgz' bun.lock); do
      code=$(curl -s -o /dev/null -w '%{http_code}' -L "$u")
      echo "$code $u" | tee -a "$GITHUB_STEP_SUMMARY"
    done
```

It does not fail the job on its own (report only); the frozen install that follows is the real gate. First run is triggered via `workflow_dispatch` / a PR containing only this file.

Outcome handling:
- 200 + install ok: risk closed, record in AGENTS.md.
- 401/403/404 or install fail: CI stays red, exact output reported. No package-manager switch and no `bun.lock` regeneration without a separate decision (options: re-resolve the two packages from public npm, or remove the two dev-only plugins).

## 5. Verification

- Run summary shows: versions, reachability table, install count, build result, lint count.
- Confirm no secret masks, no deploy steps in logs.

## 6. Rollback

Delete or revert `.github/workflows/ci.yml`; no app, database, function or deployment state affected.
