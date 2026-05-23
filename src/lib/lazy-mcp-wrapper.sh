#!/usr/bin/env bash
# lazy-mcp-wrapper.sh — defers MCP startup until first stdio input.
# Usage: lazy-mcp-wrapper.sh <command> [args...]
#
# Waits for the first byte on stdin, then starts the real MCP process
# and proxies all stdio bidirectionally. This saves RAM for MCPs that
# are declared in a profile but rarely used in a session.

set -euo pipefail

REAL_CMD="$1"
shift

# Wait for first byte (MCP client sends initialize request)
read -r -n 1 FIRST_BYTE

# Start the real MCP, feeding it the first byte + rest of stdin
{
  printf '%s' "$FIRST_BYTE"
  cat
} | exec "$REAL_CMD" "$@"
