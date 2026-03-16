# Browser Setup

## When To Use This Path

Use the browser workflow when:

- the user does not want to use a Yuque API token
- Codex only needs note operations inside one known Yuque repo
- the user can complete a one-time manual login if no reusable browser state exists yet

## StorageState-First Workflow

The default browser route is:

1. Reuse a saved Yuque `storageState` file.
2. Open the real Yuque repo page with that state.
3. Read `book_id` and `toc` from `window.appData.book`.
4. Use Yuque's frontend `/api/docs` requests for listing, creating, and updating notes.

This avoids depending on the user's live Chrome profile for normal note operations.

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

## Reuse A Saved State

Inspect the session:

```bash
node <skill-root>/scripts/yuque_browser_cli.js inspect-session --repo-url <repo-url> --storage-state-path <state-file>
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

Search notes:

```bash
node <skill-root>/scripts/yuque_browser_cli.js search-notes --repo-url <repo-url> --storage-state-path <state-file> --keyword "OpenAI" --search-in-title true --search-in-body true
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
- If the real-profile fallback reports a profile lock problem, close all Chrome windows and retry.
