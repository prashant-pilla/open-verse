#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"
exec node -r ts-node/register "$SCRIPT_DIR/src/server.ts"

