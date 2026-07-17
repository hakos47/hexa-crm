#!/usr/bin/env bash
# Configure this clone to use versioned hooks under .githooks/
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

if [[ ! -d .git ]]; then
  echo "No es un repo git: $root" >&2
  exit 1
fi

git config core.hooksPath .githooks
chmod +x .githooks/pre-commit .githooks/pre-push 2>/dev/null || true

echo "✓ core.hooksPath = .githooks"
echo "  Commits y pushes directos a main quedan bloqueados."
echo "  Overrides: ALLOW_MAIN_COMMIT=1 / ALLOW_MAIN_PUSH=1"
