---
name: yuque-notes
description: Record, update, append, search, and organize Yuque notes through either a logged-in Chrome profile or a local Yuque MCP project. Use when Codex needs to work with a user's Yuque knowledge base, reuse an existing Yuque browser session without an API token, configure or verify the local Yuque MCP server, resolve catalog paths before writing notes, or map note-management requests to the correct browser or MCP workflow.
---

# Yuque Notes

## Overview

Default to the browser workflow when the user already has Yuque open in Chrome or does not want to use a Yuque API token. Use the local MCP project only when the user explicitly has an API token and wants the API-based path.

## Workflow

1. If the user wants the free path or already has Yuque logged in, read [references/browser-setup.md](references/browser-setup.md).
2. Use `node <skill-root>/scripts/yuque_browser_cli.js inspect-session ...` to confirm that the Chrome profile can open the target Yuque repo without redirecting to `/login`.
3. Read [references/operations.md](references/operations.md) when you need to map a user request to the right browser subcommand or MCP tool.
4. Only if the user has an API token, locate the local project root. Check `./yuque-mcp-src` first. If it is missing, search for a folder containing `pyproject.toml`, `.env.example`, and `yuque_mcp/server.py`.
5. Validate the local API setup before changing MCP config or running the server. Run `python <skill-root>/scripts/check_local_project.py --project-root <path>`.
6. Read [references/mcp-setup.md](references/mcp-setup.md) only for the token-based path.

## Operating Rules

- Prefer the browser workflow when the user says to use the currently logged-in Chrome account.
- Ask the user to close Chrome before launching against a real profile if the profile may be locked.
- Prefer `upsert-note` for most "record this note" requests in browser mode.
- Use `append-note` only when the user wants incremental additions to an existing note.
- Call `get-toc` before guessing a `group_path`.
- Treat `group_path` as a slash-separated Yuque catalog path, for example `dev-tools` or `dev-tools/openai`.
- Use `search-notes` before creating a new note when title collisions are likely.
- Treat `organize-notes` as a recommendation tool. It does not move documents on its own.
- For large note bodies, write the content to a temp file and pass `--doc-body-file` or `--content-file`.
- If the user asks for Codex MCP configuration, first confirm that they actually want the token-based path, then run `python <skill-root>/scripts/print_mcp_config.py --project-root <path>`.
- If the browser workflow fails, report whether the profile was locked, the repo URL redirected to `/login`, or Playwright was missing.

## Quick Routing

- Validate the logged-in browser session: `inspect-session`
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

- When using browser mode, report the repo URL, Chrome profile directory, and chosen subcommand.
- When setting up API mode, provide the exact server command and required env keys.
- When writing notes, report the resolved `group_path` and chosen workflow.
- When troubleshooting, report whether the issue is missing browser dependencies, locked Chrome profile, login redirect, missing files, or missing env keys.
