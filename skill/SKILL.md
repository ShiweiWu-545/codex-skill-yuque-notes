---
name: yuque-notes
description: Record, update, append, search, and organize Yuque notes through either a reusable Yuque browser storageState or a local Yuque MCP project. Use when Codex needs to work with a user's Yuque knowledge base, bootstrap a first-time browser login without an API token, resolve catalog paths before writing notes, or map note-management requests to the correct browser or MCP workflow.
---

# Yuque Notes

## Overview

Default to the browser workflow when the user does not want to use a Yuque API token. The browser path is storageState-first: reuse a saved Yuque login state when possible, and create or refresh it with a manual-assisted login only when needed.

## Workflow

1. For the browser path, read [references/browser-setup.md](references/browser-setup.md).
2. Prefer `node <skill-root>/scripts/yuque_browser_cli.js inspect-session ... --storage-state-path <file>` to verify that the saved login can open the target repo.
3. If the storageState file does not exist or the repo redirects to `/login`, either:
   - run `node <skill-root>/scripts/yuque_storage_state_login.js --state-output <file> --repo-url <url>`, or
   - rerun the browser CLI with `--ensure-login-if-missing true` so it bootstraps the login interactively and saves the state file for later reuse.
4. After the repo page is reachable, use `window.appData.book` on the real repo page to read `book_id` and `toc`, then route the request with [references/operations.md](references/operations.md).
5. Only if the user explicitly wants the token-based path, locate the local MCP project. Check `./yuque-mcp-src` first. If it is missing, search for a folder containing `pyproject.toml`, `.env.example`, and `yuque_mcp/server.py`.
6. Validate the local API setup before changing MCP config or running the server. Run `python <skill-root>/scripts/check_local_project.py --project-root <path>`.
7. Read [references/mcp-setup.md](references/mcp-setup.md) only for the token-based path.

## Operating Rules

- Prefer the storageState browser workflow when the user says to use Yuque through the logged-in browser and no API token is available.
- If `--storage-state-path` is provided, reuse that file first.
- If `--storage-state-path` is omitted and `--ensure-login-if-missing true` is enabled, the CLI derives a default path under `~/.codex/yuque-notes/storage-state/<group>__<book>.json`.
- If the storageState file is missing or expired, generate or refresh it through the manual-assisted login flow instead of retrying legacy browser endpoints.
- In browser mode, read `book_id` and `toc` from the repo page, then use Yuque's real frontend `/api/docs` endpoints for list, create, and update.
- When creating a document directly inside a catalog node, use `insert_to_catalog=true`, `action=appendChild`, and `target_uuid=<catalog uuid>`.
- Call `get-toc` before guessing a `group_path`.
- Treat `group_path` as a slash-separated existing Yuque catalog path, for example `dev-tools` or `dev-tools/openai`.
- If the target `group_path` does not exist in the TOC, stop guessing and create that catalog manually before writing the note.
- Prefer `upsert-note` for most "record this note" requests in browser mode.
- Use `append-note` only when the user wants incremental additions to an existing note.
- Use `search-notes` before creating a new note when title collisions are likely.
- Treat `organize-notes` as a recommendation tool. It does not move documents on its own.
- For large note bodies, write the content to a temp file and pass `--doc-body-file` or `--content-file`.
- Treat the real Chrome profile route as a fallback only. Use it only when the user explicitly wants the real profile path and can close Chrome first.
- If the browser workflow fails, report whether the issue was a missing storageState file, expired Yuque login, locked real profile, missing browser executable, or missing `playwright-core`.
- If the user asks for Codex MCP configuration, first confirm that they actually want the token-based path, then run `python <skill-root>/scripts/print_mcp_config.py --project-root <path>`.

## Quick Routing

- Validate or bootstrap the browser session: `inspect-session`
- Inspect catalog structure in browser mode: `get-toc`
- Record or overwrite a note in browser mode: `upsert-note`
- Append a log or meeting note in browser mode: `append-note`
- Search by keyword in browser mode: `search-notes`
- Generate filing suggestions in browser mode: `organize-notes`
- Record or overwrite a note in API mode: `upsert_yuque_note`
- Append a log or meeting note in API mode: `append_yuque_note`
- Search by keyword in API mode: `search_yuque_notes`
- Inspect catalog structure in API mode: `get_yuque_repo_toc`

## Deliverables

- When using browser mode, report the repo URL, chosen subcommand, and either the storageState path or the real Chrome profile directory.
- When setting up API mode, provide the exact server command and required env keys.
- When writing notes, report the resolved `group_path` and chosen workflow.
- When troubleshooting, report whether the issue is missing browser dependencies, missing or expired storageState, login redirect, locked Chrome profile, missing files, or missing env keys.
