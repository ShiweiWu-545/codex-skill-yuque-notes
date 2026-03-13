# codex-skill-yuque-notes

`codex-skill-yuque-notes` is a public Codex skill repository for operating Yuque notes.

It supports two workflows:

- Browser workflow: reuse a logged-in Chrome profile and call Yuque through the web session, with no API token
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
|       `-- yuque_browser_cli.js
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
- `browser.chrome_user_data_dir`
- `browser.chrome_profile_directory`
- `install.install_node_dependencies`

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

Prerequisites:

- Chrome is installed
- Yuque is already logged in inside the target Chrome profile
- All Chrome windows are closed before the script starts, otherwise the profile may stay locked

Typical commands:

```powershell
node .\skill\scripts\yuque_browser_cli.js inspect-session --repo-url https://www.yuque.com/superwu/ggooe2 --chrome-user-data-dir "%LOCALAPPDATA%\Google\Chrome\User Data" --chrome-profile-directory Default
```

```powershell
node .\skill\scripts\yuque_browser_cli.js get-toc --repo-url https://www.yuque.com/superwu/ggooe2 --chrome-user-data-dir "%LOCALAPPDATA%\Google\Chrome\User Data" --chrome-profile-directory Default
```

```powershell
node .\skill\scripts\yuque_browser_cli.js upsert-note --repo-url https://www.yuque.com/superwu/ggooe2 --chrome-user-data-dir "%LOCALAPPDATA%\Google\Chrome\User Data" --chrome-profile-directory Default --group-path "dev-tools" --doc-title "debug" --doc-body-file .\note.md
```

## API MCP Workflow

This path is optional.

Use it only when you explicitly want the token-based API integration. Generate the Codex MCP config snippet with:

```powershell
python .\scripts\render_mcp_config.py --config .\config\install.local.json
```

## Publish

```powershell
git add .
git commit -m "Update browser-first Yuque workflow"
git push origin main
```

Do not commit:

- `config/install.local.json`
- `.env` files with real tokens
- copied Chrome profile data

## License

This repository uses the [MIT License](LICENSE).
