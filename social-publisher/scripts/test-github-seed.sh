#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/restore-source.mjs
npm install
npm test
