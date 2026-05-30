#!/usr/bin/env bash
# Build and publish dist/ to the gh-pages branch — GitHub Pages serves the site
# from there, so a push to `main` alone never updates the live app. Run via
# `npm run deploy`. No extra deps: a throwaway git worktree does the publish.
set -euo pipefail
cd "$(dirname "$0")/.."

npm run build

WORKTREE="$(mktemp -d)"
cleanup() { git worktree remove "$WORKTREE" --force 2>/dev/null || true; }
trap cleanup EXIT

git fetch -q origin gh-pages
# Reset a local gh-pages to match origin and check it out in the worktree.
git worktree add -q -B gh-pages "$WORKTREE" origin/gh-pages

# Overwrite the branch contents with the fresh build (keeps .git, drops stale files).
rsync -a --delete --exclude='.git' dist/ "$WORKTREE"/

git -C "$WORKTREE" add -A
if git -C "$WORKTREE" diff --cached --quiet; then
  echo "Nothing to deploy — dist/ is identical to the live build."
  exit 0
fi

TOKEN="$(grep -o 'content="[a-f0-9]\{6,\}"' "$WORKTREE/index.html" | head -1 | grep -o '[a-f0-9]\{6,\}')"
git -C "$WORKTREE" commit -q -m "Deploy: ${TOKEN:-build}"
git -C "$WORKTREE" push -q origin gh-pages
echo "Deployed ${TOKEN:-build} to gh-pages → https://kai-denrei.github.io/mandala_cymatics/"
