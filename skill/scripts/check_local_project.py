#!/usr/bin/env python3
"""Validate a local Yuque MCP project checkout."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path


REQUIRED_FILES = [
    "pyproject.toml",
    ".env.example",
    "yuque_mcp/server.py",
]

REQUIRED_ENV_KEYS = [
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


def resolve_root(project_root: str | None) -> Path:
    if project_root:
        return Path(project_root).expanduser().resolve()
    return Path.cwd().resolve()


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate the local Yuque MCP project.")
    parser.add_argument("--project-root", default=None, help="Path to the Yuque MCP project root.")
    args = parser.parse_args()

    root = resolve_root(args.project_root)
    env_values = load_env_file(root / ".env")
    missing_files = [name for name in REQUIRED_FILES if not (root / name).exists()]
    missing_env = [
        key for key in REQUIRED_ENV_KEYS if not (env_values.get(key) or os.getenv(key))
    ]

    result = {
        "project_root": str(root),
        "project_exists": root.exists(),
        "missing_files": missing_files,
        "env_file": str(root / ".env"),
        "missing_env_keys": missing_env,
        "is_ready": root.exists() and not missing_files and not missing_env,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["is_ready"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
