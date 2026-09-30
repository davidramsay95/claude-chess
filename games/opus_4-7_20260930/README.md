# Opus 4.7 Chess

A from-scratch chess game and engine, entirely self-contained: no chess libraries, no piece fonts, no external assets. Written in TypeScript, built with Vite, engine runs in a Web Worker.

## How to run

```sh
npm ci
npm run dev            # dev server (open the URL it prints)
npm test               # 5 test files, 52 tests (perft, rules, engine, save/load, bridge)
npm run build          # local production build (dist/)
```

The site build uses:

```sh
npm run build -- --base=/play/opus_4-7_20260930/
```

The output is `dist/`, served under `/play/opus_4-7_20260930/`.

## Engine

Implemented from scratch in `src/engine/`:

- **`types.ts`, `fen.ts`**: mailbox 64-square board, piece codes, FEN parse/emit.
- **`moves.ts`**: pseudo-legal generation for every piece, castling with king-safety, en passant, all four promotions, and `perft` for verification.
- **`game.ts`**: full end-state detection — checkmate, stalemate, threefold repetition, fifty-move rule, insufficient material (K-K, K+minor-K, K+B-K+B same color).
- **`search.ts`**: negamax alpha-beta with MVV-LVA move ordering, quiescence (captures + promotions), iterative deepening with a time cap.

Difficulty levels (all reply well within 5s):

| Level  | Depth | Budget | Quiescence | Randomization |
|--------|-------|--------|-----------|----------------|
| easy   | 2     | 300ms  | no        | 25% random move, top-4 window |
| medium | 3     | 800ms  | yes       | top-2 within 30cp |
| hard   | 4     | 2500ms | yes       | best move |
| expert | 6     | 4500ms | yes       | best move |

Perft is verified against four positions including start (197,281 at depth 4) and Kiwipete (97,862 at depth 3). See `test/perft.test.ts`.

## Pieces and UI

Pieces are drawn as inline SVG shapes (no font glyphs) in `src/pieces.ts`. Vanilla TypeScript UI in `src/main.ts` renders the board, handles clicks, shows the move list in SAN with disambiguation and `+`/`#` markers.

## Save/load

`src/state.ts` implements a validating `importState`: it re-runs every move through the engine before touching anything, so an invalid save leaves the current game untouched. Both the in-app dialogs and the `postMessage` bridge share this code path.

## Bridge

`src/bridge.ts` implements the `claude-chess-game`/`claude-chess-shell` protocol from `docs/save-bridge-protocol.md`:

- Sends `ready` on load, replies with `ready` to `ping`.
- Answers `request-state` with the game's export + summary (`{result, moveCount}`), or `null`/`null` before a game starts.
- Answers `load-state` with `ok:true` on success or `ok:false` + `error` on invalid state; a failure never mutates the running game.
- Ignores any message whose `event.origin !== window.location.origin` or `event.source !== window.parent`, or whose `source` field is not the shell.

Covered by unit tests in `test/bridge.test.ts` and by manual iframe tests.

## Known limitations

- Move input is click-only (no drag-and-drop). Every move is selectable by clicking the piece then the target square.
- No opening book: the engine searches from the start; expert-level opening play is generic.
- No time control (the engine's per-move budget is not surfaced to the user).
- The `insufficient material` check does not detect exhaustive "no forcing sequence to mate" positions, only the standard shortcut list (K-K, K+minor-K, K+B-K+B with bishops on same color).
