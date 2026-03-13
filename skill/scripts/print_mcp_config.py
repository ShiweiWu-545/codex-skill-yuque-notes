#!/usr/bin/env python3
"""Print a Codex MCP config snippet for a local Yuque MCP project."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path


ENV_KEYS = [
    "YUQUE_SPACE_SUBDOMAIN",
    "DEFAULT_API_TOKEN",
    "DEFAULT_GROUP_LOGIN",
    "DEFAULT_BOOK_SLUG",
]


def load_env_file(env_file: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not env_file.exists():
        return values

    for raw_line in env_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def main() -> int:
    parser = argparse.ArgumentParser(description="Print a Codex MCP config snippet.")
    parser.add_argument("--project-root", required=True, help="Path to the Yuque MCP project root.")
    parser.add_argument("--server-name", default="yuque-mcp", help="Name of the MCP server entry.")
    args = parser.parse_args()

    project_root = Path(args.project_root).expanduser().resolve()
    env_file_values = load_env_file(project_root / ".env")
    env_values = {
        key: env_file_values.get(key) or os.getenv(key) or f"<{key.lower()}>"
        for key in ENV_KEYS
    }

    config = {
        "mcpServers": {
            args.server_name: {
                "command": "python",
                "args": ["-m", "yuque_mcp.server"],
                "cwd": str(project_root),
                "env": env_values,
            }
        }
    }
    print(json.dumps(config, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
