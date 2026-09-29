# Plan: First non-deploying GitHub Actions CI (YETY Core)

Goal: prove on a fresh GitHub-hosted runner that the committed `bun.lock` installs exactly and the production frontend builds. Nothing else.

## 1. Proposed file (only one)

`.github/workflows/ci.yml`

```yaml
name: ci
on:
  pull_request:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    env:
      CI: "true"
    steps:
      - uses: actions/checkout@v4          # pin to SHA at implementation
        with:
          persist-credentials: false
      - uses: actions/setup-node@v4        # pin to SHA
        with:
          node-version-file: .nvmrc        # 22
      - uses: oven-sh/setup-bun@v2         # pin to SHA
        with:
          bun-version: 1.3.3
      - run: node --version && bun --version
      - run: bun install --frozen-lockfile
      - run: bun run build
      - run: git diff --exit-code          # lockfile/tree must stay untouched
```

No `secrets.*`, no `env` with keys, no deploy/publish/supabase steps, no caching in v1 (keeps the "fresh runner" proof honest), no artifact upload.

## 2. Expected result per step

- versions: Node 22.x, bun 1.3.3
- install: 709 packages, exit 0 (matches sandbox clean-clone run)
- build: `vite build` success, PWA precache generated
- diff check: clean

## 3. Blockers / decisions needed

- **B1 – Internal package source (likely first failure).** `bun.lock` lines 390 and 392 resolve `@lovable.dev/vite-plugin-dev-server-bridge@1.3.2` and `@lovable.dev/vite-plugin-hmr-gate@1.8.0` from `europe-west4-npm.pkg.dev/lovable-core-prod/sandbox-npm-cache`. Reachability from GitHub runners is unverified. Rule: if install fails there, CI stays red and we report; we do not switch package manager or regenerate `bun.lock` without a separate decision (options then: lockfile re-resolved against public npm, or drop the two dev-only plugins).
- **B2 – Lint gate.** `bun run lint` currently fails on ~30 pre-existing errors in untouched app code. Recommendation: exclude lint from v1 (or run it as a non-blocking `continue-on-error` step). Making it blocking needs a separate cleanup task.
- **B3 – Build-time settings.** The frontend reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`. The build succeeds without them; CI will not inject any values (no secrets, no production endpoints). The built bundle is never served or uploaded.
- **B4 – Branch protection.** Making `ci / build` a required check is a GitHub settings change — separate decision after the first green run.

## 4. Verification after implementation

1. Open a PR containing only `ci.yml`; confirm run triggers.
2. Check logs: versions, install count, build success, clean diff.
3. Confirm log contains no secret masks, no network calls besides package download, no deploy steps.

## 5. Risks and rollback

- Risk: third-party actions — mitigated by SHA pinning and `permissions: contents: read`.
- Risk: B1 red build — informational only, no production impact.
- Rollback: delete `.github/workflows/ci.yml` (single-file revert). No app, database, function, or deployment state is affected.
