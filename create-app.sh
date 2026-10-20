#!/usr/bin/env bash
# Turns a website into a desktop app. See: ./create-app.sh --help
exec node "$(dirname "$0")/scripts/create-app.js" "$@"
