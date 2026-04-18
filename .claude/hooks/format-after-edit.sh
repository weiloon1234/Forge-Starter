#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
INPUT="$(cat)"

FILE_PATH="$(
  printf '%s' "$INPUT" | python3 -c '
import json
import sys

data = json.load(sys.stdin)
print(data.get("tool_input", {}).get("file_path", ""))
'
)"

if [[ -z "$FILE_PATH" || ! -f "$FILE_PATH" ]]; then
  exit 0
fi

case "$FILE_PATH" in
  "$PROJECT_DIR"/*) ;;
  *) exit 0 ;;
esac

REL_PATH="${FILE_PATH#"$PROJECT_DIR"/}"

case "$REL_PATH" in
  *.rs)
    (
      cd "$PROJECT_DIR"
      rustfmt --edition 2021 "$FILE_PATH"
    )
    ;;
  frontend/*)
    case "$FILE_PATH" in
      *.js|*.jsx|*.ts|*.tsx)
        (
          cd "$PROJECT_DIR"
          npx biome check --write "$FILE_PATH"
        )
        ;;
    esac
    ;;
esac
