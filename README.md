# codex-skill-yuque-notes

`codex-skill-yuque-notes` is a public Codex skill repository for operating Yuque notes.

It supports two workflows:

- Browser workflow: reuse a saved Yuque browser `storageState` and call Yuque through the real web session, with no API token
- API MCP workflow: connect to a local `yuque-mcp` project, which requires a Yuque API token

For most personal use cases, the browser workflow is the default and recommended path.

## Repository Layout

```text
.
|-- config/
|   `-- install.example.json
|-- scripts/
|   |-- install_skill.ps1
|   |-- install_skill.py
|   `-- render_mcp_config.py
|-- skill/
|   |-- SKILL.md
|   |-- package.json
|   |-- agents/openai.yaml
|   |-- references/
|   |   |-- browser-setup.md
|   |   |-- mcp-setup.md
|   |   `-- operations.md
|   `-- scripts/
|       |-- check_local_project.py
|       |-- print_mcp_config.py
|       |-- yuque_browser_cli.js
|       `-- yuque_storage_state_login.js
|-- .gitignore
`-- LICENSE
```

## Install The Skill

1. Copy the config template.

```powershell
Copy-Item .\config\install.example.json .\config\install.local.json
```

2. Edit `config/install.local.json`.

Important fields:

- `skill.name`
- `codex.codex_home`
- `browser.repo_url`
- `install.install_node_dependencies`

Optional fallback fields for the real Chrome profile route:

- `browser.chrome_user_data_dir`
- `browser.chrome_profile_directory`

3. Install the skill.

```powershell
python .\scripts\install_skill.py --config .\config\install.local.json
```

or

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install_skill.ps1 -ConfigPath .\config\install.local.json
```

By default, the installer copies the skill into:

```text
%USERPROFILE%\.codex\skills\yuque-notes
```

If `install.install_node_dependencies` is `true`, the installer also runs:

```powershell
npm install --omit=dev
```

inside the installed skill directory, so `playwright-core` is available for the browser workflow.

## Browser Workflow

This path does not require a Yuque API token.

When a valid `storageState` already exists, the CLI can now fall back to direct HTTPS requests with the saved Yuque cookies if Playwright cannot launch a bundled browser executable. That removes the need to stop and install Playwright browsers for common read/write note operations.

After the first successful run on a device, the CLI also saves a local session history record so later calls can directly reuse the last successful repo URL, workflow, and `storageState` path.

For existing-note modifications, the CLI also saves a local original Markdown draft and a local modified Markdown draft before overwriting the note in Yuque. This gives you a much more reliable rollback path when note bodies are complex.

### First-Time Login

Create a reusable storageState file:

```powershell
node .\skill\scripts\yuque_storage_state_login.js --state-output .\.cache\yuque-state.json --repo-url <repo-url> [--username <value>] [--password <value>]
```

You can also let the main CLI bootstrap it automatically:

```powershell
node .\skill\scripts\yuque_browser_cli.js inspect-session --repo-url <repo-url> --storage-state-path .\.cache\yuque-state.json --ensure-login-if-missing true
```

If `--storage-state-path` is omitted and `--ensure-login-if-missing true` is set, the CLI saves the state under:

```text
~/.codex/yuque-notes/storage-state/<group>__<book>.json
```

### Reuse The Saved State

Inspect the repo session:

```powershell
node .\skill\scripts\yuque_browser_cli.js inspect-session --repo-url <repo-url> --storage-state-path .\.cache\yuque-state.json
```

Reuse the last successful route directly:

```powershell
node .\skill\scripts\yuque_browser_cli.js inspect-session --use-history true
```

Read the TOC:

```powershell
node .\skill\scripts\yuque_browser_cli.js get-toc --repo-url <repo-url> --storage-state-path .\.cache\yuque-state.json
```

Or load the last successful repo and path from local history:

```powershell
node .\skill\scripts\yuque_browser_cli.js get-toc --use-history true
```

Upsert a note:

```powershell
node .\skill\scripts\yuque_browser_cli.js upsert-note --repo-url <repo-url> --storage-state-path .\.cache\yuque-state.json --group-path "dev-tools" --doc-title "debug" --doc-body-file .\note.md
```

Append to a note:

```powershell
node .\skill\scripts\yuque_browser_cli.js append-note --repo-url <repo-url> --storage-state-path .\.cache\yuque-state.json --group-path "dev-tools" --doc-title "debug" --content-file .\append.md
```

For any existing note update, the CLI now uses a backup-first local Markdown workflow:

- export the current Yuque note to a local Markdown draft
- modify that local draft
- overwrite the full Yuque note with the modified Markdown

This applies to both `append-note` and `upsert-note` when the target note already exists, including notes that were originally created in Lake format.

By default, local drafts are stored under:

```text
~/.codex/yuque-notes/local-drafts/
```

Override the local draft workspace with:

```powershell
--local-draft-dir <dir>
```

Delete a note by exact catalog path and title:

```powershell
node .\skill\scripts\yuque_browser_cli.js delete-note --repo-url <repo-url> --storage-state-path .\.cache\yuque-state.json --group-path "dev-tools" --doc-title "debug"
```

Delete a note by exact doc ID:

```powershell
node .\skill\scripts\yuque_browser_cli.js delete-note --repo-url <repo-url> --storage-state-path .\.cache\yuque-state.json --doc-id 123456
```

### Refresh An Expired State

If the saved state is no longer valid, rerun the same command with:

```powershell
--ensure-login-if-missing true
```

The CLI opens the manual-assisted login flow again, refreshes the state file, and retries the original action.

### Fallback: Real Chrome Profile

Use the real-profile route only when you explicitly want it and can close Chrome first:

```powershell
node .\skill\scripts\yuque_browser_cli.js inspect-session --repo-url <repo-url> --chrome-user-data-dir "%LOCALAPPDATA%\Google\Chrome\User Data" --chrome-profile-directory Default
```

### Note About Controlled Chrome

The manual login helper may start with a controlled browser window showing `about:blank` and the standard Chrome automation banner. That is expected and does not mean Yuque failed.

## API MCP Workflow

This path is optional.

Use it only when you explicitly want the token-based API integration. Generate the Codex MCP config snippet with:

```powershell
python .\scripts\render_mcp_config.py --config .\config\install.local.json
```

## Publish

```powershell
git add .
git commit -m "Update Yuque storageState-first workflow"
git push origin main
```

Do not commit:

- `config/install.local.json`
- `.env` files with real tokens
- copied browser profile data
- saved Yuque `storageState` files

## License

This repository uses the [MIT License](LICENSE).
