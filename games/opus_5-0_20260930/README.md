# Opus Chess

A complete game of chess against an engine written from scratch for this folder.
No chess library, no opening book, no external assets: the rules, the search, the
piece artwork and the sounds are all in `src/`.

## Running it

```sh
npm ci
npm run dev      # http://localhost:5173
```

```sh
npm test         # vitest, 159 tests
npm run build    # typecheck, then a static bundle in dist/
```

The platform builds with `npm run build -- --base=/play/opus_5-0_20260930/`, so
`base` is deliberately absent from `vite.config.ts`. Nothing in the source uses a
root-absolute URL; the worker is created with
`new Worker(new URL("./worker/engine.worker.ts", import.meta.url))` so Vite
rewrites it for whatever sub-path the game is served from.

## The engine

**Board.** A 0x88 mailbox (`src/engine/position.ts`). The board is a 128-entry
array laid out as 16×8, so a square is off the board exactly when
`(square & 0x88) !== 0` and the sliding-piece loops need no edge tests. Moves are
packed into a single 32-bit integer (origin, destination, captured piece,
promotion and flags), which keeps the search from allocating tens of objects per
node. `makeMove`/`unmakeMove` update an incremental Zobrist hash and push the
irreversible state onto preallocated typed arrays.

**Rules.** Everything: castling with the passing-through-check rule, en passant
including the case where taking would expose your own king, promotion to any of
the four pieces, checkmate, stalemate, threefold repetition, the fifty-move rule
and insufficient material. Move generation is verified against perft: the
standard positions match to depth 6 from the start (119,060,324 nodes) and depth
5 on Kiwipete (193,690,690 nodes). The committed test suite runs the shallower
counts so it stays fast.

**Search** (`src/engine/search.ts`). Negamax alpha-beta with iterative deepening,
a 1M-entry transposition table, quiescence search with delta pruning, null-move
pruning, late move reductions, check extensions, MVV-LVA capture ordering,
killer moves, a history heuristic and mate-distance pruning. Repetition inside
the search is detected from the same Zobrist hashes the game uses, so the engine
knows when it is walking into a draw.

**Evaluation** (`src/engine/evaluate.ts`). Hand-written and tapered: material,
piece-square tables, mobility, passed/doubled/isolated pawns, rooks on open
files, the bishop pair, a king pawn shield and a tempo bonus. Every term has a
midgame and an endgame value, blended by a phase counter derived from the
material still on the board.

### Difficulty

The levels differ along three axes, not just depth, so they feel different rather
than merely slower.

| Level | Depth | Budget | Quiescence | Root noise |
|---|---|---|---|---|
| Easy | 2 | 0.4 s | off | ±110 cp |
| Medium | 4 | 0.9 s | on | ±40 cp |
| Hard | 7 | 1.6 s | on | none |
| Expert | unlimited | 3.4 s | on | none |

Switching quiescence off is what makes Easy genuinely beatable: it walks into
recaptures the way a beginner does. Levels with root noise search every root move
on a full window so their scores are comparable before one is picked at random;
the others use principal-variation search and always play the best move. In a
browser on a typical machine Expert reaches depth 11–12 in its budget.

The search runs in a Web Worker (`src/worker/engine.worker.ts`), so the board
never blocks: measured main-thread latency during an Expert search is under
12 ms. If a browser refuses to construct the worker, the search is imported and
run inline instead so the game still plays.

## The interface

- Choose White, Black or Random, and one of the four strengths.
- Click a piece then a square, or drag it. Every square is a real button, so the
  board works from the keyboard and reads correctly to a screen reader.
- Full move list in algebraic notation; click any move, or use the arrow keys, to
  step back through the game and return to the live position.
- Take back, resign, flip the board, and a sound toggle.
- Captured pieces and the material advantage beside each player.
- Light and dark themes follow the system setting. The layout works from 360 px
  to a wide desktop, sizes itself to its iframe, and never touches `window.top`.

Piece artwork is original SVG built from primitives in `src/ui/pieces.ts`; colour
comes only from CSS custom properties, so one geometry serves both sides. Sounds
are synthesised with the Web Audio API in `src/ui/sounds.ts`, with no audio files.

Preferences and the game in progress are kept in `localStorage` under keys
prefixed `opus_5-0_20260930:`, which is what the "Resume last game" button on the
setup screen restores.

## Saving

"Export game" hands you the portable state as a downloadable `.json` file or on
the clipboard; "Import game" accepts a file or pasted text. The same state moves
over the shell's `postMessage` bridge (`src/bridge.ts`), which answers `ping`,
`request-state` and `load-state`, sends `ready` on load, and reports `null` state
and summary before a game has started. Messages are ignored unless
`event.origin === window.location.origin` and `event.source === window.parent`.

Both routes go through one importer (`src/engine/gamestate.ts`). It validates
every field and replays every half-move through the rules into a *new* game
before anything is swapped in, so a state with an illegal move is reported as
`Move 3 (g2g5) is not legal` and the game on screen is left exactly as it was.

## Layout

```
src/
  engine/    position.ts  movegen, make/unmake, FEN, Zobrist
             game.ts      history, SAN, every way a game ends
             evaluate.ts  tapered evaluation
             search.ts    alpha-beta search
             gamestate.ts the portable save format and its importer
             difficulty.ts
  worker/    engine.worker.ts, think.ts, protocol.ts
  ui/        board.ts, pieces.ts, sounds.ts, movelist.ts, material.ts
  app.ts     the controller
  bridge.ts  the save-bridge protocol
tests/       perft, rules, SAN, save state, bridge, search, artwork
```

## Known limitations

- No opening book and no endgame tablebases; the engine plays from move one on
  its own evaluation.
- Threefold repetition and the fifty-move rule end the game automatically rather
  than offering a claim, which is what an app of this kind normally does.
- Insufficient material covers the uncontroversial dead positions (bare kings,
  lone minor piece, and same-coloured bishops). King and two knights against a
  bare king is treated as playable, as FIDE does.
- Draws are not offered or accepted; the engine plays on until a result.
