#!/usr/bin/env bash
# Usage: ./bundle.sh <url>
set -euo pipefail
cd "$(dirname "$0")"
if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <url>" >&2
  exit 1
fi
[ -d node_modules ] || npm install
node scripts/bundle.js "$1"
