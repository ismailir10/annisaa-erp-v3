#!/usr/bin/env bash
# install-hooks.sh — activate project git hooks
#
# Run once after cloning the repo:
#   ./scripts/install-hooks.sh
#
# This sets git's core.hooksPath to .githooks and writes a marker file so
# other tooling can detect whether hooks have been installed in this clone.

set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -d .githooks ]; then
  echo "install-hooks: .githooks directory not found at $ROOT/.githooks" >&2
  exit 1
fi

# Ensure all hook files are executable
chmod +x .githooks/pre-commit .githooks/prepare-commit-msg .githooks/pre-push 2>/dev/null || true

# Configure git to use .githooks
git config core.hooksPath .githooks

# Write marker file (gitignored) so hooks themselves can verify installation
mkdir -p .githooks
touch .githooks/.installed

echo "install-hooks: active. core.hooksPath = .githooks"
echo "install-hooks: pre-commit, prepare-commit-msg, pre-push enabled."
