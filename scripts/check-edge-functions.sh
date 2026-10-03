#!/usr/bin/env bash
# Offline type/import check for the Edge Functions named in issue #22.
#
# Why: run from the repo, Deno discovers the root package.json and resolves npm:
# specifiers against the frontend node_modules (jpeg-js/fflate absent, an older
# @supabase/supabase-js without the ./cors subpath). `--node-modules-dir=none`
# makes Deno resolve npm: specifiers from its own cache instead, which is how the
# functions are written. Runtime imports and production config stay unchanged.
#
# Scope/limits: static `deno check` only. It downloads packages into the Deno cache
# but never invokes, deploys or calls any live service. A pass does NOT prove the
# deployed runtime behaves identically.
#
# Usage: bun run check:functions [function-name ...]
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FUNCS_DIR="$ROOT/supabase/functions"
DEFAULT=(instructor-website-publish instructor-photo-upload instructor-import-apply instructor-import-preview private-appointments)
if [ "$#" -gt 0 ]; then TARGETS=("$@"); else TARGETS=("${DEFAULT[@]}"); fi

command -v deno >/dev/null 2>&1 || { echo "deno not found" >&2; exit 2; }

failed=0
for fn in "${TARGETS[@]}"; do
  entry="$FUNCS_DIR/$fn/index.ts"
  if [ ! -f "$entry" ]; then echo "FAIL $fn (missing $entry)"; failed=1; continue; fi
  if out="$(cd "$FUNCS_DIR" && deno check --node-modules-dir=none "$fn/index.ts" 2>&1)"; then
    echo "OK   $fn"
  else
    echo "FAIL $fn"; echo "$out" | sed 's/^/     /'; failed=1
  fi
done
exit $failed
