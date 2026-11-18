# Agent notes

## Approved saved data

The app saves nothing in the browser unless it is listed here with the user's approval.
Each entry must also be in `e2e/approved-storage.ts`, which the smoke tests enforce.

| What | Where | Why | Approved |
|---|---|---|---|
| _(none)_ | | | |

Rules for anything added here: IndexedDB via Dexie (versioned schema with migrations, read with
`useLiveQuery`), JSON export and import, and `navigator.storage.persist()` after the first save.

See CLAUDE.md for commands, layout and the full set of rules.
