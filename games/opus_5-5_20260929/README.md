# Opus Chess (opus_5-5_20260929)

Play chess against a self-written engine in the browser. Vite + vanilla TypeScript, no runtime dependencies, no chess libraries.

## Run it

```sh
npm ci
npm run dev                                        # local dev server
npm test                                           # Vitest: rules, engine, save state, bridge, UI helpers
npm run build -- --base=/play/opus_5-5_20260929/   # typecheck + production build into dist/
```

## Features

- Play as white, black or a random side against four engine levels: easy, medium, hard and expert.
- Click or drag to move. Legal targets are marked. Promotion opens a picker for queen, rook, bishop or knight.
- Full rules: legal move generation, check, checkmate, stalemate, castling (not out of, through or into check), en passant, promotion to any piece, threefold repetition, the fifty-move rule and insufficient material. Draws by repetition and the fifty-move rule are applied automatically.
- Scoresheet in standard algebraic notation. Click a move, use the arrow buttons or the keyboard arrows, Home and End to step through the game.
- Export the game as a `.json` file or copy it; import a file or pasted text. Imports are validated and every move is replayed through the rules before anything changes.
- Save bridge for the host site (see `docs/save-bridge-protocol.md` in the repository root): answers `ping`, `request-state` and `load-state`, sends `ready` on load.
- Piece artwork is hand-drawn SVG and sounds are synthesised with the Web Audio API, so nothing is loaded from the network.

## Engine

The engine lives in `src/engine` and runs in a module Web Worker so the page never freezes.

- Board: 0x88 mailbox with packed integer moves, make/unmake and incremental Zobrist hashing (`src/core/position.ts`). Verified with perft from the start position (depth 4: 197,281), Kiwipete (depth 3: 97,862) and four other standard perft positions.
- Search: iterative deepening negamax with alpha-beta and principal variation search, a transposition table, quiescence search on captures, check extensions, null-move pruning, killer and history move ordering, and repetition and fifty-move draw detection inside the tree.
- Evaluation: tapered midgame/endgame material and piece-square tables, doubled, isolated and passed pawns, mobility, rooks on open files, bishop pair and a king pawn shield.
- Search extras: mate-distance pruning, reverse futility pruning and late-move reductions.
- Levels:

| Level | Depth cap | Evaluation noise | Time budget (soft / hard) | Character |
|---|---|---|---|---|
| Easy | 1 ply + short capture search | ±150 cp | 300 / 400 ms | Misses forks and mate threats, beatable by beginners |
| Medium | 4 plies | ±25 cp | 500 / 800 ms | Sees simple tactics, punishes hanging pieces |
| Hard | 8 plies | none | 1.2 / 2 s | Solid tactical play |
| Expert | unlimited (typically 10 to 14 plies) | none | 1.9 / 3.5 s | Full strength |

In engine-vs-engine test games medium beat easy 4/4 and hard beat medium 4/4. Every level answers within about 3.5 seconds (plus a 350 ms minimum so replies do not feel instant).

## Layout

| Path | Contents |
|---|---|
| `src/core` | Board, move generation, FEN, SAN, game result detection |
| `src/engine` | Evaluation, search, worker and worker client |
| `src/state` | Save format validation and replay, the session controller, the postMessage bridge |
| `src/ui` | Board view, app shell, piece artwork, sounds, styles |

## Limitations

- Draws by threefold repetition and the fifty-move rule end the game automatically instead of waiting for a claim.
- New games always start from the standard position. Imports accept any valid FEN as `startFen`.
- `localStorage` is only used for the sound preference (`opus_5-5_20260929:sound`).
