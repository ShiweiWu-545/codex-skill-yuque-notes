# Local MCP Setup

This path is optional. Use it only when the user has a Yuque API token and explicitly wants the API-based MCP flow.

## Find the Project

Look for a local folder that contains all of the following:

- `pyproject.toml`
- `.env.example`
- `yuque_mcp/server.py`

Check `./yuque-mcp-src` first when working in a repository that bundles the local Yuque MCP project next to this skill.

## Validate Before Configuring

Run:

```bash
python <skill-root>/scripts/check_local_project.py --project-root <project-root>
```

Use the result to confirm:

- the project root is correct
- the required files exist
- `.env` is present or environment variables are already exported
- required Yuque keys are available

## Install the Local Project

From the project root:

```bash
python -m pip install -e .
```

## Required Environment Keys

The project expects these keys:

- `YUQUE_SPACE_SUBDOMAIN`
- `DEFAULT_API_TOKEN`
- `DEFAULT_GROUP_LOGIN`
- `DEFAULT_BOOK_SLUG`

Typical `.env` values start from:

```env
YUQUE_SPACE_SUBDOMAIN=www
DEFAULT_API_TOKEN=your_yuque_api_token
DEFAULT_GROUP_LOGIN=your_group_login
DEFAULT_BOOK_SLUG=your_book_slug
```

## Start the Server

From the project root:

```bash
python -m yuque_mcp.server --transport stdio
```

The package may also expose:

```bash
yuque-mcp --transport stdio
```

## Generate a Codex MCP Config Snippet

Run:

```bash
python <skill-root>/scripts/print_mcp_config.py --project-root <project-root>
```

This prints a ready-to-paste `mcpServers` block that points Codex to the local server.

## Smoke Checks

Use one or more of these after setup:

```bash
python -m unittest discover -s tests -p "test_*.py"
python <skill-root>/scripts/check_local_project.py --project-root <project-root>
python <skill-root>/scripts/print_mcp_config.py --project-root <project-root>
```
