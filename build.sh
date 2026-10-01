#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")"

npm ci --silent --no-audit --no-fund

version="$(node -p "require('./package.json').version")"
mkdir -p build

npm run --silent check
npm run --silent build -- --logLevel warn
npm run --silent package -- --out "build/codex-profiles-${version}.vsix"

printf 'Built: build/codex-profiles-%s.vsix\n' "$version"
