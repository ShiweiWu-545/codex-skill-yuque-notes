# Tool Routing

## Browser Commands

Map note-management intents to the browser CLI when the user wants the Yuque web-session workflow:

- record or overwrite a note: `upsert-note`
- append to an existing note: `append-note`
- search notes: `search-notes`
- inspect the repo catalog: `get-toc`
- generate filing suggestions: `organize-notes`
- validate or bootstrap the current browser login state: `inspect-session`

## Preferred Browser Flow

1. Start with `inspect-session`.
2. If the storageState file is missing or the repo redirects to `/login`, rerun with `--ensure-login-if-missing true` or call `yuque_storage_state_login.js` directly.
3. Run `get-toc` and resolve the exact `group_path` from `window.appData.book.toc`.
4. Map `group_path` to the target catalog node UUID.
5. Choose the write or search command that matches the user request.

## Browser Implementation Rules

- Browser mode reads the real repo page first and extracts `book_id` plus `toc` from `window.appData.book`.
- Document listing, creation, and updates go through Yuque's frontend `/api/docs` endpoints.
- New documents are inserted directly into the target catalog during creation with:
  - `insert_to_catalog=true`
  - `action=appendChild`
  - `target_uuid=<catalog uuid>`
- If a legacy `/api/v2/repos/...` route returns `401`, stop retrying that route and switch to the `/api/docs` browser flow.
- `group_path` must resolve to an existing TOC node. If it does not, create the catalog manually first.

## Write Operations

### `upsert-note`

Use for:

- "record this note"
- "create or update a note"
- repeated note titles such as `debug`, daily logs, or project notes

Inputs:

- `group_path`
- `doc_title`
- `doc_body`

Behavior:

- updates the matching note only when the same title already exists in the exact target `group_path`
- creates a new note in the target `group_path` when the same title only exists elsewhere
- writes the new note directly into the target catalog during creation

### `append-note`

Use for:

- adding a dated log entry
- appending meeting notes
- extending an existing note instead of replacing it

Inputs:

- `group_path`
- `doc_title`
- `content`

Behavior:

- appends to the matching note in the exact target `group_path`
- creates a new note in that `group_path` if no exact match exists there yet

## Search And Discovery

### `search-notes`

Use for:

- title lookup
- body keyword search
- finding candidate notes before dedupe or append operations

Prefer enabling both title and body search unless the user asks for exact title matching only.

### `get-toc`

Use for:

- resolving folder names
- confirming where a note should be created
- checking whether a catalog node already exists

## Organization

### `organize-notes`

Use for:

- generating filing suggestions
- grouping notes by keyword rules

Important:

- this produces recommendations
- it does not move notes automatically

## MCP-Only Lower-Level Tools

These lower-level tools remain for the token-based MCP route:

- `create_yuque_group`
- `create_yuque_doc_in_group`
- `get_yuque_doc_list`
- `get_yuque_doc_detail`

Use them only when the user explicitly chooses the API-token workflow.
