# Save bridge protocol

The shell (`apps/shell`) hosts each game in an iframe at `/play/<slug>/`, same origin. The shell and the game talk with `window.postMessage`. The game's own export and import feature defines what the saved `state` contains; the shell treats it as opaque JSON.

## Rules for both sides

- Same origin only. Always send with `targetOrigin = window.location.origin`, never `"*"`.
- The receiver ignores a message unless `event.origin === window.location.origin` and `event.source` is the expected window (the iframe's `contentWindow` for the shell, `window.parent` for the game).
- Every message is an object with a `source` field and a `type` field. Ignore anything else.
- `requestId` is an opaque string chosen by the shell. Replies echo it.

## Game to shell (`source: "claude-chess-game"`)

| type | fields | when |
|---|---|---|
| `ready` | none | once the game can answer requests. Send on load, and also reply with it if the shell asks (see `ping`). |
| `state` | `requestId`, `state`, `summary` | reply to `request-state` |
| `loaded` | `requestId`, `ok`, `error?` | reply to `load-state` |

`state` is the game's existing export as a JSON-serialisable value: parse it if the export is a JSON string, otherwise send the string. Send `state: null` and `summary: null` when there is nothing to save yet, for example on the setup screen before a game has started.

`summary` is `{ result, moveCount }`.

- `result` is one of `"1-0"`, `"0-1"`, `"1/2-1/2"`, `"*"` (unfinished).
- `moveCount` is the number of half-moves played.

`loaded.ok` is `false` with a short human-readable `error` when the state is invalid. A failed load must leave the current game untouched.

## Shell to game (`source: "claude-chess-shell"`)

| type | fields | effect |
|---|---|---|
| `ping` | none | game replies with `ready` |
| `request-state` | `requestId` | game replies with `state` |
| `load-state` | `requestId`, `state` | game imports `state` using its existing import and replay logic, then replies with `loaded` |

The shell sends `ping` after each iframe load, because the game's `ready` may have been sent before the shell was listening.

## Limits

The API rejects a saved state larger than 256 KiB, so the shell shows an error if the reply is too big.
