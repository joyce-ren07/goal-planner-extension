#!/bin/bash
# Auto-commit and push changes after every file edit, unless on main.

BRANCH=$(git -C "$(dirname "$0")/../.." rev-parse --abbrev-ref HEAD 2>/dev/null)

if [[ "$BRANCH" == "main" || "$BRANCH" == "master" ]]; then
  exit 0
fi

REPO_ROOT=$(git -C "$(dirname "$0")/../.." rev-parse --show-toplevel 2>/dev/null)

if [[ -z "$REPO_ROOT" ]]; then
  exit 0
fi

cd "$REPO_ROOT" || exit 0

# Stage all changes
git add -A

# Only commit if there's something staged
if git diff --cached --quiet; then
  exit 0
fi

TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")
git commit -m "auto: agent edit at $TIMESTAMP" --no-verify -q

git push origin "$BRANCH" -q 2>/dev/null

exit 0
