# Browser Setup

## When To Use This Path

Use the browser workflow when:

- the user does not want to use a Yuque API token
- Codex only needs note operations inside one known Yuque repo
- the user can complete a one-time manual login if no reusable browser state exists yet

## StorageState-First Workflow

The default browser route is:

1. Reuse a saved Yuque `storageState` file.
2. Reuse a local history record from a previous successful run when one exists on the current device.
3. Open the real Yuque repo page with that state.
4. Read `book_id` and `toc` from `window.appData.book`.
5. Use Yuque's frontend `/api/docs` requests for listing, creating, and updating notes.

This avoids depending on the user's live Chrome profile for normal note operations.

If Playwright cannot launch because the bundled browser executable is missing, the CLI should fall back to direct HTTPS requests with the saved `storageState` cookies:

1. Request the real repo page with the cookies from the `storageState` file.
2. Parse `window.appData = JSON.parse(decodeURIComponent(...))` from the returned HTML.
3. Read `book_id`, `toc`, and `login` from that parsed payload.
4. Reuse the same cookies against Yuque frontend `/api/docs` endpoints.

Use this fallback before telling the user to install Playwright browsers.

## First Login And State Capture

If there is no local storageState yet, create one with the dedicated login helper:

```bash
node <skill-root>/scripts/yuque_storage_state_login.js --state-output <state-file> --repo-url <repo-url> [--username <value>] [--password <value>]
```

What happens:

- a controlled browser window opens
- the script optionally fills username and password
- the user completes captcha, slider, or other manual checks
- the script saves `storageState` locally after login succeeds
- if `--repo-url` is provided, the script also verifies that the target repo opens without redirecting to `/login`

You can also let the main browser CLI bootstrap the first login automatically:

```bash
node <skill-root>/scripts/yuque_browser_cli.js inspect-session --repo-url <repo-url> --storage-state-path <state-file> --ensure-login-if-missing true
```

If `--storage-state-path` is omitted and `--ensure-login-if-missing true` is set, the CLI derives a default path under:

```text
~/.codex/yuque-notes/storage-state/<group>__<book>.json
```

After the first success, the CLI also stores the successful repo URL, workflow, and reusable path info under:

```text
~/.codex/yuque-notes/session-history.json
```

That allows later calls on the same device to omit `--repo-url` and often omit `--storage-state-path`.

## Reuse A Saved State

Inspect the session:

```bash
node <skill-root>/scripts/yuque_browser_cli.js inspect-session --repo-url <repo-url> --storage-state-path <state-file>
```

Reuse the last successful route on the same device:

```bash
node <skill-root>/scripts/yuque_browser_cli.js inspect-session --use-history true
```

Read the TOC:

```bash
node <skill-root>/scripts/yuque_browser_cli.js get-toc --repo-url <repo-url> --storage-state-path <state-file>
```

Upsert a note:

```bash
node <skill-root>/scripts/yuque_browser_cli.js upsert-note --repo-url <repo-url> --storage-state-path <state-file> --group-path "dev-tools" --doc-title "debug" --doc-body-file <path-to-markdown>
```

Append content:

```bash
node <skill-root>/scripts/yuque_browser_cli.js append-note --repo-url <repo-url> --storage-state-path <state-file> --group-path "dev-tools" --doc-title "debug" --content-file <path-to-markdown>
```

For any existing note modification, the CLI now uses a local Markdown round-trip:

1. export the current Yuque note to a local Markdown draft
2. modify that local Markdown
3. overwrite the full Yuque note with the modified Markdown

This applies to both `append-note` and `upsert-note` when the target note already exists, including notes that were originally Lake-format.

The default local draft directory is:

```text
~/.codex/yuque-notes/local-drafts/
```

Override it with:

```bash
--local-draft-dir <dir>
```

Delete a note:

```bash
node <skill-root>/scripts/yuque_browser_cli.js delete-note --repo-url <repo-url> --storage-state-path <state-file> --group-path "dev-tools" --doc-title "debug"
```

Or delete by exact doc ID:

```bash
node <skill-root>/scripts/yuque_browser_cli.js delete-note --repo-url <repo-url> --storage-state-path <state-file> --doc-id 123456
```

Search notes:

```bash
node <skill-root>/scripts/yuque_browser_cli.js search-notes --repo-url <repo-url> --storage-state-path <state-file> --keyword "OpenAI" --search-in-title true --search-in-body true
```

If you want to isolate or test history behavior, point the CLI at a custom history file:

```bash
node <skill-root>/scripts/yuque_browser_cli.js get-toc --repo-url <repo-url> --storage-state-path <state-file> --history-file <path-to-history.json>
```

## Refresh An Expired State

If the saved state redirects to `/login`, rerun the same command with:

```bash
--ensure-login-if-missing true
```

The CLI will reopen the manual-assisted login flow, overwrite the saved state file, and retry the original command.

## Catalog Resolution

Before writing, use `get-toc` and resolve the exact slash-separated `group_path` from the real TOC.

Important:

- browser mode writes directly into an existing catalog node by passing `target_uuid` during `POST /api/docs`
- if the `group_path` is not present in the current TOC, create the missing catalog manually before writing

## Fallback: Real Chrome Profile

Keep the real Chrome profile route only as a fallback when the user explicitly wants it.

Example:

```bash
node <skill-root>/scripts/yuque_browser_cli.js inspect-session --repo-url <repo-url> --chrome-user-data-dir "%LOCALAPPDATA%/Google/Chrome/User Data" --chrome-profile-directory Default
```

Use this only when:

- the user insists on reusing the real profile directly
- all Chrome windows can be closed first
- storageState reuse is not desired

## About Controlled Chrome And `about:blank`

When the login helper opens a controlled browser window, Chrome may show:

- a blank initial page such as `about:blank`
- the message that Chrome is being controlled by automated test software

That is a normal automation startup state, not a Yuque error.

## Failure Modes

- If the state file is missing, create it with `yuque_storage_state_login.js` or rerun the CLI with `--ensure-login-if-missing true`.
- If the repo redirects to `/login`, the saved state has expired or is invalid.
- If Node cannot resolve `playwright-core`, run `npm install --omit=dev` in the installed skill directory.
- If Playwright is installed but the browser executable is missing, prefer the storageState-cookie HTTPS fallback before asking for `npx playwright install`.
- If the real-profile fallback reports a profile lock problem, close all Chrome windows and retry.
