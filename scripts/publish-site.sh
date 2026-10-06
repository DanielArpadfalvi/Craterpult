#!/usr/bin/env bash
# Copy the public web site (docs/site/*, the source of truth) into a checkout of the public
# DanielArpadfalvi/craterpult-site repo, which GitHub Pages serves from its default branch root:
#   https://danielarpadfalvi.github.io/craterpult-site/            (home)
#   https://danielarpadfalvi.github.io/craterpult-site/privacy.html (PRIVACY_URL in src/game/links.ts)
#   https://danielarpadfalvi.github.io/craterpult-site/support.html
# The site repo has to be created once by the owner (public, empty, `main` branch, Pages:
# "Deploy from a branch" → main → / (root)); this script never creates or pushes anything.
# Usage: scripts/publish-site.sh <path-to-craterpult-site-checkout>
# Only copies; review, commit and push in the target repo yourself (see docs/RELEASE.md 7.3).
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "usage: $0 <craterpult-site checkout dir>" >&2
  echo "  first time: git clone https://github.com/DanielArpadfalvi/craterpult-site.git ../craterpult-site" >&2
  exit 2
fi

src="$(cd "$(dirname "$0")/.." && pwd)/docs/site"
dest="$1"

if [ ! -d "$dest" ]; then
  echo "error: target directory '$dest' does not exist (clone craterpult-site first)" >&2
  exit 1
fi
if [ ! -d "$dest/.git" ]; then
  echo "warning: '$dest' is not a git checkout root" >&2
fi

cp -R "$src"/. "$dest"/
# Serve the files as-is (no Jekyll processing on GitHub Pages).
touch "$dest/.nojekyll"

echo "Copied $(find "$src" -type f | wc -l) file(s) from docs/site to $dest"
echo "Next: cd \"$dest\" && git add -A && git commit -m 'Update site' && git push"
