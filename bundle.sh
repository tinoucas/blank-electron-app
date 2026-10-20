#!/usr/bin/env bash
# Usage: ./bundle.sh <url> [--icon <file|url>] [--skip-check]   (see --help)
exec node "$(dirname "$0")/scripts/bundle.js" "$@"
