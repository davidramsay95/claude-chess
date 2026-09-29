# Chess

A playable chess game with a from-scratch engine. Vanilla TypeScript, Vite, Vitest. No runtime dependencies.

## Run

```
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
npm test         # full suite
STRENGTH=1 npx vitest run tests/strength.test.ts   # opt-in level-vs-level matches (~2.5 min)
```

## Features

- Play as White, Black or Random against Easy, Medium, Hard or Expert.
- Full rules: castling, en passant, promotion picker, check, checkmate, stalemate, threefold repetition (automatic), fifty-move rule, insufficient material.
- Click or drag to move, legal-move hints, last-move and check highlights, SAN move list, captured pieces, undo, resign, flip board.
- Original SVG pieces and layout; responsive down to phone width.

## Layout

- `src/engine/`: rules and engine. `position.ts` (make/unmake, Zobrist), `movegen.ts`, `game.ts` (status, SAN, undo), `evaluate.ts`, `search.ts` (iterative deepening alpha-beta, TT, quiescence, null move, LMR), `levels.ts`, `openingBook.ts`, `worker.ts` (runs search off the UI thread).
- `src/ui/`: DOM-free controller and pure logic plus view modules.
- `tests/`: perft-verified move generation, engine tactics, UI logic.
