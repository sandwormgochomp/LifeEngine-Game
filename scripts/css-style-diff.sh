#!/usr/bin/env bash
# Prove a CSS refactor changed nothing visible.
#
# Dumps computed styles for every styled element across five UI states from the
# working tree and from another revision, then diffs them. Exits non-zero if any
# element's computed style moved.
#
#   scripts/css-style-diff.sh [ref]     # ref defaults to HEAD
#
# Why this and not the visual snapshots: those allow a 5% pixel diff, so a modal
# losing 140px of width or a panel losing its border passes. Splitting
# Hud.module.css caused seven such regressions and the suite stayed green.
#
# The one trap worth knowing: the comparison worktree shares node_modules with
# the main checkout by symlink, and Vite refuses to serve files outside its root,
# so the fonts 403 unless server.fs.allow is widened. Without that every text
# metric shifts and you get ~130 phantom differences. This script patches it.
set -euo pipefail

REF="${1:-HEAD}"
REPO="$(git rev-parse --show-toplevel)"
WORK="$(mktemp -d)"
OLD="$WORK/old"
PORT_OLD=3111
cleanup() {
  # kill the whole group: `exec` below makes OLD_PID the node process itself,
  # but vite spawns children of its own
  [[ -n "${OLD_PID:-}" ]] && kill "$OLD_PID" 2>/dev/null || true
  [[ -n "${OLD_PID:-}" ]] && pkill -P "$OLD_PID" 2>/dev/null || true
  git -C "$REPO" worktree remove --force "$OLD" 2>/dev/null || true
  git -C "$REPO" worktree prune
  rm -rf "$WORK"
}
trap cleanup EXIT

echo "==> baseline worktree at $REF"
git -C "$REPO" worktree add -q --detach "$OLD" "$REF"
ln -s "$REPO/node_modules" "$OLD/node_modules"
cp "$REPO/tests/style-dump.spec.js" "$OLD/tests/"

# Vite will not serve the symlinked node_modules (fonts) without this.
python3 - "$OLD/vite.config.ts" "$REPO" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1]); s = p.read_text()
s = s.replace("  server: {\n    port: 3000,\n  },",
              "  server: {\n    port: 3000,\n    fs: { allow: ['%s', '%s'] },\n  }," % (sys.argv[2], p.parent))
p.write_text(s)
PY

cat > "$OLD/playwright.diff.config.js" <<EOF
const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests', workers: 1, timeout: 30000, reporter: [['list']],
  use: { baseURL: 'http://localhost:$PORT_OLD' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
EOF

if ss -ltn 2>/dev/null | grep -q ":$PORT_OLD "; then
  echo "port $PORT_OLD is already in use -- a previous run leaked a server; kill it first" >&2
  exit 1
fi

echo "==> starting baseline server on :$PORT_OLD"
# exec so $! is the node process rather than the subshell, or cleanup kills the
# wrapper and leaves a stale server bound to a deleted worktree
(cd "$OLD" && exec node node_modules/.bin/vite --port "$PORT_OLD" --strictPort >"$WORK/vite.log" 2>&1) &
OLD_PID=$!
for _ in $(seq 1 40); do
  curl -sf -o /dev/null "http://localhost:$PORT_OLD/" && break || sleep 0.5
done
if ! curl -sf -o /dev/null "http://localhost:$PORT_OLD/"; then
  echo "baseline server never came up:" >&2; cat "$WORK/vite.log" >&2; exit 1
fi

echo "==> dumping baseline"
(cd "$OLD" && DUMP_OUT="$WORK/old.json" npx playwright test style-dump \
    --config=playwright.diff.config.js --reporter=line)

echo "==> dumping working tree"
(cd "$REPO" && DUMP_OUT="$WORK/new.json" npx playwright test style-dump --reporter=line)

echo "==> diff"
python3 - "$WORK/old.json" "$WORK/new.json" <<'PY'
import json, sys, collections
old = json.load(open(sys.argv[1])); new = json.load(open(sys.argv[2]))
only_old, only_new = set(old) - set(new), set(new) - set(old)
diffs = collections.defaultdict(list)
for k in set(old) & set(new):
    for p, v in old[k].items():
        if new[k].get(p) != v:
            diffs[p].append((k, v, new[k].get(p)))
total = sum(len(v) for v in diffs.values())
print(f"  {len(old)} baseline elements, {len(new)} current")
if only_old or only_new:
    print(f"  DOM changed: {len(only_old)} element(s) gone, {len(only_new)} new")
    for k in list(only_old)[:5]: print("    gone:", k)
    for k in list(only_new)[:5]: print("    new: ", k)
for p, items in sorted(diffs.items(), key=lambda x: -len(x[1])):
    print(f"\n  {p}: {len(items)}")
    for k, a, b in items[:10]:
        print(f"     {k}\n        was={a!r}\n        now={b!r}")
if total or only_old or only_new:
    print(f"\n{total} computed-style difference(s) -- inspect before shipping")
    sys.exit(1)
print("\nidentical: no computed style changed")
PY
