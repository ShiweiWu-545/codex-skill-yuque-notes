# Tool Routing

## Browser Commands

Map the same intents to the browser CLI when the user wants the logged-in Chrome workflow:

- record or overwrite a note: `upsert-note`
- append to an existing note: `append-note`
- search notes: `search-notes`
- inspect the repo catalog: `get-toc`
- generate filing suggestions: `organize-notes`

## Preferred Flow

1. Resolve the target catalog path with `get_yuque_repo_toc` if the user gives a visual location, partial path, or screenshot-based instruction.
2. Choose the write tool based on intent.
3. Only use the lower-level legacy tools when the specialized tools are not a fit.

## Write Operations

### `upsert_yuque_note`

Use for:

- "record this note"
- "create or update a note"
- repeated note titles such as `debug`, daily logs, or project notes

Inputs:

- `group_path`
- `doc_title`
- `doc_body`

Behavior:

- creates the note if it does not exist
- updates the matching note when the same title already exists

### `append_yuque_note`

Use for:

- adding a dated log entry
- appending meeting notes
- extending an existing note instead of replacing it

Inputs:

- `group_path`
- `doc_title`
- `content`

## Search and Discovery

### `search_yuque_notes`

Use for:

- title lookup
- body keyword search
- finding candidate notes before dedupe or append operations

Prefer enabling both title and body search unless the user asks for exact title matching only.

### `get_yuque_repo_toc`

Use for:

- resolving folder names
- confirming where a note should be created
- inspecting whether a catalog node already exists

## Organization

### `organize_yuque_notes`

Use for:

- generating filing suggestions
- grouping notes by keyword rules

Important:

- this produces recommendations
- it does not move notes automatically

## Lower-Level Tools

### `create_yuque_group`

Use when the user explicitly wants to create a new catalog node.

### `create_yuque_doc_in_group`

Use when the user explicitly wants a plain create operation and does not want upsert semantics.

### `get_yuque_doc_list`

Use to inspect note lists or enumerate notes when search is not enough.

### `get_yuque_doc_detail`

Use to fetch one known note by `doc_id`.

## Examples

- Write a note into `dev-tools` with a stable title: use `upsert_yuque_note`
- Add a log section to `debug`: use `append_yuque_note`
- Find all notes mentioning `OpenAI`: use `search_yuque_notes`
- Confirm whether `dev-tools/openai` exists: use `get_yuque_repo_toc`
