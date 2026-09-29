# Fable Chess

A complete chess game with a self-written engine, built for the Claude chess collection. Vanilla TypeScript on Vite, no runtime dependencies, no chess libraries.

## Run it

```sh
npm ci
npm run dev        # local development server
npm test           # vitest: perft, rules, search, save state, bridge
npm run build      # typecheck + vite build into dist/
npm run build -- --base=/play/fable_5-1_20260929/   # what the platform runs
```

## Layout

| Path | Purpose |
|---|---|
| `src/engine/position.ts` | 0x88 board, FEN, make/unmake, attack detection, legal move generation, Zobrist hashing |
| `src/engine/game.ts` | Move history, SAN, checkmate, stalemate, threefold repetition, fifty-move rule, insufficient material, resignation |
| `src/engine/eval.ts`, `search.ts` | Evaluation and search (see below) |
| `src/engine/worker.ts`, `engineClient.ts` | The engine runs in a module Web Worker so the interface never freezes |
| `src/state/gameState.ts` | Export and import of the portable saved-game state, with full validation and replay |
| `src/bridge/bridge.ts` | The `postMessage` save bridge to the hosting site |
| `src/ui/` | Board, move list, dialogs, SVG piece artwork and synthesised sounds |
| `tests/` | Vitest suites |

## Engine

The rules engine uses a 0x88 mailbox board. Moves are packed integers; make/unmake keeps an undo record so the search never copies the board. Move generation is pseudo-legal followed by a king-safety check, which is verified by perft: start position 20 / 400 / 8,902 / 197,281 and Kiwipete 48 / 2,039 / 97,862, plus three further reference positions.

Search is iterative-deepening alpha-beta with quiescence search, MVV-LVA capture ordering, killer moves and a transposition table keyed on the Zobrist hash. Positions already seen in the game are scored as draws so the engine avoids repeating when ahead. Evaluation is material plus piece-square tables.

| Level | How it plays |
|---|---|
| Easy | One ply, material only, picks randomly among moves within 150 cp of the best (but never walks into mate in one), so it blunders like a beginner |
| Medium | Fixed depth 2 plus quiescence with the full evaluation, no noise; finds mate in one |
| Hard | Iterative deepening to depth 5 with a 1.5 s budget; finds mate in two |
| Expert | Iterative deepening to depth 8 with a 3.5 s budget and check extensions |

A hard cap of 4 s is enforced inside the search (the clock is checked every 2048 nodes), so every level answers within about five seconds. Quiescence does not detect mate at its leaves, so a mate in N needs a nominal depth of 2N.

## Saved games

Export produces the shared state shape (`version`, `startFen`, `playerColor`, `difficulty`, `moves`, `resigned`). Import validates every field and replays every move through the rules engine before touching the current game; an invalid state is reported and the current game is left as it was. The site's save bridge (`ready`, `ping`, `request-state`, `load-state`) uses the same import and export code.

## Assets

Piece artwork is inline SVG written in `src/ui/pieces.ts`. Sounds are generated with the Web Audio API. Nothing is loaded from outside the folder.
