#!/usr/bin/env python3
"""Install the yuque-notes skill into a Codex home directory."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
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


def load_config(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def resolve_npm_executable() -> str:
    for candidate in ("npm.cmd", "npm"):
        resolved = shutil.which(candidate)
        if resolved:
            return resolved
    raise FileNotFoundError("Unable to locate npm or npm.cmd in PATH.")


def main() -> int:
    root = repo_root()
    parser = argparse.ArgumentParser(description="Install the yuque-notes skill.")
    parser.add_argument("--config", default=str(default_config_path(root)), help="Path to install config JSON.")
    args = parser.parse_args()

    config_path = resolve_path(args.config, base_dir=root)
    config = load_config(config_path)

    skill_name = config["skill"]["name"]
    source_dir = resolve_path(config["skill"].get("source_dir", "skill"), base_dir=root)
    codex_home = resolve_path(config["codex"].get("codex_home", "~/.codex"), base_dir=root)
    target_root = codex_home / "skills"
    target_dir = target_root / skill_name

    target_root.mkdir(parents=True, exist_ok=True)
    if target_dir.exists():
        shutil.rmtree(target_dir)
    shutil.copytree(source_dir, target_dir)

    install_config = config.get("install", {})
    should_install_node = bool(install_config.get("install_node_dependencies"))
    package_json = target_dir / "package.json"
    node_dependencies_installed = False
    if should_install_node and package_json.exists():
        subprocess.run(
            [resolve_npm_executable(), "install", "--omit=dev"],
            cwd=target_dir,
            check=True,
        )
        node_dependencies_installed = True

    result = {
        "skill_name": skill_name,
        "source_dir": str(source_dir),
        "target_dir": str(target_dir),
        "config_path": str(config_path),
        "node_dependencies_installed": node_dependencies_installed,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
