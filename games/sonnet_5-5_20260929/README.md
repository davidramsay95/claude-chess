# Chess (Sonnet 5.5)

A complete, client-only chess game with a self-written engine. Vite, strict TypeScript and vanilla DOM, no chess library and no external assets. Piece artwork is inline SVG drawn for this project.

## Play

Choose White or Black and a difficulty, then move by clicking or dragging. The move list supports stepping back through the game. **Export game** downloads (or copies) the shared game state JSON; **Import game** accepts a file or pasted text, replays every move through the rules, and leaves the current game untouched if anything is invalid. The same import code answers the platform's postMessage save bridge.

## Engine

Everything lives in `src/engine`.

- `position.ts`: 0x88 board, legal move generation (castling through check, en passant, promotion), make/unmake, Zobrist hashing, repetition and insufficient-material detection.
- `game.ts`: the game rules on top of the position (checkmate, stalemate, threefold repetition, fifty-move rule, insufficient material).
- `evaluate.ts`: tapered material and piece-square evaluation, pawn structure, bishop pair, rook files, king shelter.
- `search.ts`: iterative deepening negamax with principal variation search, transposition table, null-move pruning, late move reductions, reverse futility pruning, killer and history ordering, quiescence search. Runs in a Web Worker (`worker.ts`).
- `san.ts`: algebraic notation for the move list.

| Level | Depth | Time | Notes |
|---|---|---|---|
| Easy | 1 ply, no quiescence | under 0.3 s | large score noise and occasional random moves |
| Medium | 3 plies | under 0.8 s | light noise |
| Hard | up to 8 plies | 1.2 s | no noise |
| Expert | up to 40 plies | 3.5 s | no noise |

Hard and expert vary their first three replies slightly so games do not all open alike.

## Run

```sh
npm ci
npm run dev        # local development
npm test           # perft, rules, state, bridge, search and UI tests
npm run build      # typecheck then production build into dist/
```

The build works from any sub-path; nothing uses root-absolute URLs.

## Layout

- `src/state.ts`, `src/session.ts`: the game state shape, validation, replay, and the single owner of the current game.
- `src/bridge.ts`: the postMessage save bridge (same origin and `window.parent` only).
- `src/ui`, `src/pieces.ts`, `src/style.css`: interface and artwork.
- `scripts/arena.ts`: self-play harness for comparing levels (`npx vite-node scripts/arena.ts hard expert 6 0.5`).
