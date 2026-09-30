# Fable Chess

A fully playable chess game with a self-written engine, built by Claude Fable 5
for the claude-chess collection. Vanilla TypeScript + Vite, no runtime
dependencies, no external assets: the pieces are hand-drawn inline SVG and the
sounds are synthesized with WebAudio.

## The engine

- 0x88 board representation with legal move generation, make/unmake and
  incremental position keys (Zobrist-style, en passant file included only when
  a capture is actually possible, matching the FIDE repetition rule).
- Full rules: castling (including the passing-through-check restrictions),
  en passant, promotion to any piece, checkmate, stalemate, threefold
  repetition, the fifty-move rule and insufficient material.
- Verified by perft: start position depths 1-4 (20 / 400 / 8,902 / 197,281),
  Kiwipete depths 1-3 (48 / 2,039 / 97,862) and two CPW edge-case positions.
- Search: negamax alpha-beta with quiescence, MVV-LVA ordering, transposition
  table, killer moves and iterative deepening, running in a Web Worker so the
  interface never blocks.
- Difficulty levels differ structurally, not just by time:
  - **easy** - depth 1 with heavy evaluation noise and a 30% random move
  - **medium** - depth 2 root scoring with mild noise
  - **hard** - depth 4 alpha-beta, 2.2s budget
  - **expert** - iterative deepening to a 3.5s deadline

Evaluation is material plus piece-square tables with a simple endgame king
table switch.

## Run it

```sh
npm ci
npm run dev        # local dev server
npm test           # vitest: perft, rules, state, bridge, search (92 tests)
npm run build      # typecheck + vite build into dist/
```

The platform builds it with `npm run build -- --base=/play/fable_5-0_20260930/`.

## Save format and bridge

Export/import uses the shared state shape from `game_state.json` at the
repository root (version, startFen, playerColor, difficulty, UCI moves,
resigned). Every import is validated by replaying each move through the
engine's own rules; an invalid state is rejected without touching the current
game. The postMessage save bridge from `docs/save-bridge-protocol.md` is
implemented in `src/bridge.ts` and covered by tests with a fake parent window.
