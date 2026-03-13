---
name: yuque-notes
description: Record, update, append, search, and organize Yuque notes through a local Yuque MCP project. Use when Codex needs to work with a user's Yuque knowledge base, configure or verify the local Yuque MCP server, resolve catalog paths before writing notes, or map note-management requests to the correct Yuque MCP tool.
---

# Yuque Notes

## Overview

Use a local Yuque MCP project as the primary path for Yuque note workflows. Prefer the MCP server over browser automation whenever the local project and API token are available.

## Workflow

1. Locate the project root. Check `./yuque-mcp-src` first. If it is missing, search for a folder containing `pyproject.toml`, `.env.example`, and `yuque_mcp/server.py`.
2. Validate the local setup before changing MCP config or running the server. Run `python <skill-root>/scripts/check_local_project.py --project-root <path>`.
3. Read [references/mcp-setup.md](references/mcp-setup.md) when you need install steps, env requirements, or a Codex MCP config snippet.
4. Read [references/operations.md](references/operations.md) when you need to map a user request to the right Yuque tool or choose parameters.
5. Use browser automation only as a fallback when the local MCP project cannot satisfy the task.

## Operating Rules

- Prefer `upsert_yuque_note` for most "record this note" requests.
- Use `append_yuque_note` only when the user wants incremental additions to an existing note.
- Call `get_yuque_repo_toc` before guessing a `group_path`.
- Treat `group_path` as a slash-separated Yuque catalog path, for example `dev-tools` or `dev-tools/openai`.
- Use `search_yuque_notes` before creating a new note when title collisions are likely.
- Treat `organize_yuque_notes` as a recommendation tool. It does not move documents on its own.
- If the user asks for Codex MCP configuration, run `python <skill-root>/scripts/print_mcp_config.py --project-root <path>`.
- If the user reports write failures, first verify `.env` and required keys with `python <skill-root>/scripts/check_local_project.py --project-root <path>`.

## Quick Routing

- Record or overwrite a note: `upsert_yuque_note`
- Append a log or meeting note: `append_yuque_note`
- Search by keyword: `search_yuque_notes`
- Inspect catalog structure: `get_yuque_repo_toc`
- Create a new catalog node: `create_yuque_group`
- Create a document without upsert behavior: `create_yuque_doc_in_group`
- Read existing content or metadata: `get_yuque_doc_list`, `get_yuque_doc_detail`
- Generate filing suggestions: `organize_yuque_notes`

## Deliverables

- When setting up the project, provide the exact server command and required env keys.
- When writing notes, report the resolved `group_path` and chosen tool.
- When troubleshooting, report missing files, missing env keys, and the next concrete fix.
