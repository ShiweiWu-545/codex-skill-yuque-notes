# Browser Setup

## When To Use This Path

Use the browser workflow when:

- the user already has Yuque logged in through Chrome
- the user does not want to use a Yuque API token
- Codex only needs note operations inside one known Yuque repo

## Preconditions

- Chrome is installed
- the user can log into Yuque in the selected Chrome profile
- all Chrome windows are closed before the script starts, otherwise the profile may stay locked

## Default Windows Paths

Typical Chrome user data root:

```text
%LOCALAPPDATA%\Google\Chrome\User Data
```

Typical profile name:

```text
Default
```

## Main Commands

Inspect session:

```bash
node <skill-root>/scripts/yuque_browser_cli.js inspect-session --repo-url <repo-url> --chrome-user-data-dir "%LOCALAPPDATA%/Google/Chrome/User Data" --chrome-profile-directory Default
```

Read TOC:

```bash
node <skill-root>/scripts/yuque_browser_cli.js get-toc --repo-url <repo-url> --chrome-user-data-dir "%LOCALAPPDATA%/Google/Chrome/User Data" --chrome-profile-directory Default
```

Upsert a note with a body file:

```bash
node <skill-root>/scripts/yuque_browser_cli.js upsert-note --repo-url <repo-url> --chrome-user-data-dir "%LOCALAPPDATA%/Google/Chrome/User Data" --chrome-profile-directory Default --group-path "dev-tools" --doc-title "debug" --doc-body-file <path-to-markdown>
```

Append content:

```bash
node <skill-root>/scripts/yuque_browser_cli.js append-note --repo-url <repo-url> --chrome-user-data-dir "%LOCALAPPDATA%/Google/Chrome/User Data" --chrome-profile-directory Default --group-path "dev-tools" --doc-title "debug" --content-file <path-to-markdown>
```

Search notes:

```bash
node <skill-root>/scripts/yuque_browser_cli.js search-notes --repo-url <repo-url> --chrome-user-data-dir "%LOCALAPPDATA%/Google/Chrome/User Data" --chrome-profile-directory Default --keyword "OpenAI" --search-in-title true --search-in-body true
```

## Failure Modes

- If the page redirects to `/login`, the selected profile is not logged into Yuque.
- If Chrome exits immediately or the script reports a profile lock problem, ask the user to close all Chrome windows and retry.
- If Node cannot resolve `playwright-core`, run `npm install --omit=dev` in the installed skill directory.
