#!/usr/bin/env python3
"""Render a Codex MCP config snippet from the repository config."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def default_config_path(root: Path) -> Path:
    local_path = root / "config" / "install.local.json"
    if local_path.exists():
        return local_path
    return root / "config" / "install.example.json"


def resolve_path(raw_value: str, *, base_dir: Path) -> Path:
    expanded = os.path.expandvars(os.path.expanduser(raw_value))
    path = Path(expanded)
    if not path.is_absolute():
        path = (base_dir / path).resolve()
    return path


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def load_env_file(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}

    result: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        result[key.strip()] = value.strip()
    return result


def main() -> int:
    root = repo_root()
    parser = argparse.ArgumentParser(description="Render a Codex MCP config snippet.")
    parser.add_argument("--config", default=str(default_config_path(root)), help="Path to install config JSON.")
    args = parser.parse_args()

    config_path = resolve_path(args.config, base_dir=root)
    config = load_json(config_path)
    mcp_config = config["mcp"]

    project_root = resolve_path(mcp_config["project_root"], base_dir=root)
    env_file_values = load_env_file(project_root / ".env")
    env_values = {}

    for key, default_value in mcp_config.get("env", {}).items():
        env_values[key] = env_file_values.get(key) or os.getenv(key) or default_value

    rendered = {
        "mcpServers": {
            mcp_config["server_name"]: {
                "command": mcp_config["command"],
                "args": mcp_config["args"],
                "cwd": str(project_root),
                "env": env_values,
            }
        }
    }
    print(json.dumps(rendered, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
