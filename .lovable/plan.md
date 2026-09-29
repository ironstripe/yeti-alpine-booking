# Plan: First non-deploying GitHub Actions CI (YETY Core) — final

Note: a draft matching this plan already exists in the sandbox at `.github/workflows/ci.yml` (not yet run on GitHub). Approving this plan means: review that file against this outline and adjust only where it differs.

## 1. Exact filename

`.github/workflows/ci.yml` — the only file. No other file is created or changed.

## 2. Step-by-step plan

1. Triggers: `pull_request`, `push` to `main`, `workflow_dispatch`.
2. Least privilege: `permissions: contents: read`; checkout with `persist-credentials: false`; no `secrets.*`, no environments, no cache, no artifacts, no `.npmrc`/registry tokens.
3. Setup: Node from `.nvmrc` (22) via `actions/setup-node`; bun `1.3.3` via `oven-sh/setup-bun`; all actions pinned to commit SHAs.
4. Job `build` (hard gates, in order):
   - print versions to the run summary
   - reachability diagnostic (see 4)
   - `bun install --frozen-lockfile`
   - `bun run build`
   - `git diff --exit-code`
5. Job `lint` (separate, `continue-on-error: true`): frozen install, then `set -o pipefail; bun run lint 2>&1 | tee lint.log`; the lint step itself shows red, the job is marked allowed-to-fail, full output in the log, last lines in the run summary. Becomes blocking later by removing `continue-on-error` (separate task).

## 3. Minimal YAML outline

```yaml
name: ci
on: { pull_request: {}, push: { branches: [main] }, workflow_dispatch: {} }
permissions: { contents: read }
jobs:
  build:
    runs-on: ubuntu-24.04
    steps:
      - checkout (persist-credentials: false)
      - setup-node (node-version-file: .nvmrc)
      - setup-bun (bun-version: 1.3.3)
      - versions -> $GITHUB_STEP_SUMMARY
      - reachability diagnostic (curl, no auth, non-gating)
      - bun install --frozen-lockfile     # gate
      - bun run build                     # gate
      - git diff --exit-code              # gate
  lint:
    runs-on: ubuntu-24.04
    continue-on-error: true
    steps: [checkout, setup-node, setup-bun, bun install --frozen-lockfile,
            bun run lint | tee lint.log (pipefail), summary if: always()]
```

## 4. Internal package cache — reachability test

`bun.lock` lines 390/392 resolve two `@lovable.dev` dev plugins from `europe-west4-npm.pkg.dev/lovable-core-prod/sandbox-npm-cache`. The diagnostic step extracts those `.tgz` URLs from `bun.lock` and requests each with plain `curl` (no credentials, no token), writing `HTTP-code URL` to the run summary. No fallback: no npm, no public-registry override, no lockfile rewrite. The frozen install is the real test.

## 5. Failure behavior and evidence

- Install fails -> `build` job red, build and diff steps skipped, workflow red. Nothing retried.
- Evidence to collect: reachability table (HTTP codes), full install step log (exact error, package, URL), runner image version, Node/bun versions, commit SHA, run URL.
- Follow-up is a separate decision (see 8); CI is not modified to "go green".

## 6. Explicitly excluded

Deploy, preview publish, secrets, database/migration changes, Edge Function calls, test functions, branch-protection or other GitHub settings, package updates/lockfile regeneration, application-code changes.

## 7. Validation after implementation

1. Local diff review: only `.github/workflows/ci.yml` changed.
2. Syntax: YAML parse locally; `actionlint` via `nix run nixpkgs#actionlint` if available.
3. Grep: no `secrets.`, deploy, supabase references in steps.
4. Push / PR containing only this file; trigger run.
5. Manual log review: versions, reachability codes, install count (~709), build success, clean diff, lint job visible with its count, no secret masks.

## 8. Risks, rollback, open decisions

- Risk: GitHub runners cannot reach the Lovable cache (sandbox returned 200, GitHub unverified).
- Risk: third-party actions — mitigated by SHA pins and read-only permissions.
- Rollback: delete `.github/workflows/ci.yml`; no runtime impact.
- Decision if install fails: re-resolve the two plugins from public npm (new `bun.lock`) or remove the two dev-only plugins.
- Decision later: make `ci / build` a required check (branch protection).
- Decision later: lint-debt cleanup to make lint blocking.
