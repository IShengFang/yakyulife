#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm ci
if [[ "$(uname -s)" == "Linux" ]]; then
  npx playwright install --with-deps chromium webkit
else
  npx playwright install chromium webkit
fi
