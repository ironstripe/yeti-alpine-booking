# Plan: First non-deploying GitHub Actions CI (YETY Core) — corrected

Revision per your corrections 1–6. Nothing is implemented until you approve.

## 1. Exact filename

`.github/workflows/ci.yml` — the only file touched. The current sandbox draft at that path is replaced with the corrected content below; no other repository file is created or changed (AGENTS.md untouched). Reachability evidence goes only into GitHub step logs and `$GITHUB_STEP_SUMMARY` — never into repo files.

## 2. Verified action pins (immutable SHAs)

- `actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683` # v4.2.2
- `actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020` # v4.4.0
- `oven-sh/setup-bun@735343b667d3e6f658f44d0eca948eb6282f2b76` # v2.0.2

## 3. Step-by-step plan

1. Triggers: `pull_request`, `push` to `main`, `workflow_dispatch`.
2. Least privilege: `permissions: contents: read`; checkout with `persist-credentials: false`; no `secrets.*`, no environments, no cache, no artifacts, no registry tokens.
3. Setup: Node from `.nvmrc` (22) via setup-node; bun `1.3.3` via setup-bun; all three actions pinned to the SHAs above.
4. Job `build` (hard gates, in order):
   - print versions to the run summary
   - reachability diagnostic (see 5) — never gates
   - `bun install --frozen-lockfile` — the actual hard gate
   - `bun run build`
   - `git diff --exit-code`
5. Job `lint` (separate, always green): frozen install, then lint with its true exit code captured (`lint_exit=$?`), full output visible in the log, exit code and last lines written to the run summary, then explicit `exit 0` so the job can never mask the build result. Lint becomes blocking later by removing the `exit 0` (separate decision).

## 4. Minimal YAML outline

```yaml
name: ci
on: { pull_request: {}, push: { branches: [main] }, workflow_dispatch: {} }
permissions: { contents: read }
jobs:
  build:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
        with: { persist-credentials: false }
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with: { node-version-file: .nvmrc }
      - uses: oven-sh/setup-bun@735343b667d3e6f658f44d0eca948eb6282f2b76 # v2.0.2
        with: { bun-version: 1.3.3 }
      - run: versions -> $GITHUB_STEP_SUMMARY
      - name: Reachability diagnostic (non-gating)
        run: |
          for url in $(grep -o 'https://europe-west4-npm.pkg.dev[^"]*\.tgz' bun.lock); do
            code=$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 10 --max-time 30 -L "$url") || code="curl-error"
            echo "$code $url" | tee -a "$GITHUB_STEP_SUMMARY"
          done
          exit 0   # diagnostic never fails the job
      - run: bun install --frozen-lockfile   # hard gate
      - run: bun run build                   # hard gate
      - run: git diff --exit-code            # hard gate
  lint:
    runs-on: ubuntu-24.04
    steps:
      - checkout / setup-node / setup-bun (same pins)
      - run: bun install --frozen-lockfile
      - name: Lint (non-blocking)
        run: |
          set +e
          bun run lint 2>&1 | tee lint.log
          lint_exit=${PIPESTATUS[0]}
          {
            echo "## Lint (non-blocking)"
            echo "lint exit code: $lint_exit"
            tail -n 5 lint.log
          } >> "$GITHUB_STEP_SUMMARY"
          exit 0   # never masks the build result
```

## 5. Internal package cache — reachability diagnostic (non-gating)

`bun.lock` resolves the two `@lovable.dev` dev plugins from `europe-west4-npm.pkg.dev/lovable-core-prod/sandbox-npm-cache`. The step extracts those `.tgz` URLs from `bun.lock` and requests each with plain `curl` (no credentials), with finite timeouts (`--connect-timeout 10`, `--max-time 30`), logging the HTTP code per URL to the log and `$GITHUB_STEP_SUMMARY`. Any curl failure is tolerated (recorded as `curl-error`) and the step explicitly exits 0. The frozen install remains the only gate. No fallback: no npm, no public-registry override, no lockfile rewrite.

## 6. Failure behavior and evidence

- Install fails -> `build` job red, build and diff steps skipped, workflow red. Nothing retried.
- Evidence to collect from logs/summary: reachability table (HTTP codes), full install step log (exact error, package, URL), runner image, Node/bun versions, commit SHA, run URL.
- Follow-up is a separate decision (see 9); CI is not modified to "go green".

## 7. Explicitly excluded

Deploy, preview publish, secrets, database/migration changes, Edge Function calls, test functions, branch-protection or other GitHub settings, package updates, lockfile regeneration, application-code changes, AGENTS.md and every other repo file.

## 8. Validation after implementation

1. Local diff review: only `.github/workflows/ci.yml` changed.
2. Syntax: YAML parse locally; `actionlint` if available.
3. Grep: no `secrets.`, deploy, supabase references in steps; the three SHA pins match exactly.
4. Push / PR containing only this file; trigger run.
5. Manual log review: versions, reachability codes, install count (~709), build success, clean diff, lint job green with its true exit code in the summary.

## 9. Risks, rollback, open decisions

- Risk: GitHub runners cannot reach the Lovable cache (sandbox returned 200; GitHub unverified) — first run is the transparent reachability test.
- Risk: third-party actions — mitigated by SHA pins and read-only permissions.
- Rollback: delete `.github/workflows/ci.yml`; no runtime impact.
- Decision if install fails: re-resolve the two plugins from public npm (new `bun.lock`) or remove the two dev-only plugins.
- Decision later: make `ci / build` a required check (branch protection).
- Decision later: lint-debt cleanup to make lint blocking.
