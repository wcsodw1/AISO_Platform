#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
python3 scripts/export_static.py

if [ "${1:-}" != "--push" ]; then
  echo "GitHub Pages files are ready in ./docs"
  echo "Run ./publish.sh --push to commit and push them."
  exit 0
fi

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
  echo "This folder is not inside a Git repository."
  exit 1
}

git add docs data/products.json
if git diff --cached --quiet; then
  echo "No published changes to commit."
  exit 0
fi

git commit -m "Publish AISO Platform"
git push
