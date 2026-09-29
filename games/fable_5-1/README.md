# Chess

A fully playable chess game in the browser against a self-written engine. No servers, no dependencies at runtime: the rules, the search and the UI are all hand-written TypeScript, and the pieces are hand-authored SVG.

## Play

```sh
npm install
npm run dev
```

Open the printed URL (http://localhost:5173 by default), pick a side and a strength, and press Begin.

- **Play as White or Black.** When you take Black the engine opens and the board flips to your side.
- **Four strengths.** Easy, Medium, Hard, Expert.
- **Moving.** Click a piece then its destination, or drag and drop (mouse and touch). Legal targets are marked; the last move and a king in check are highlighted.
- **Promotion.** A picker appears when a pawn reaches the last rank.
- **Controls.** Undo (takes back your move and the engine's reply), Flip, Resign, New game. Escape clears a selection.

A production build lives in `dist/` after `npm run build`; serve it from any static host.

## Rules coverage

Every rule of chess is enforced by the engine core in `src/engine/position.ts`: legal move generation with pins and checks, castling (both sides, no castling out of, through or into check), en passant, promotion to any piece, checkmate, stalemate, the fifty-move rule, threefold repetition and insufficient material (king vs king, king and one minor piece, and bishops all on one square colour). Move generation is validated against the standard perft reference positions.

## Engine

| Strength | Search |
| --- | --- |
| Easy | Depth 1 with a 50 % chance of a random legal move |
| Medium | Depth 2 plus quiescence, sometimes picks from the top three |
| Hard | Fixed depth 4 plus quiescence |
| Expert | Iterative deepening to depth 8 within a 2.5 s budget |

The search (`src/engine/search.ts`) is negamax with alpha-beta pruning, quiescence search, a transposition table, MVV-LVA capture ordering, killer moves, check extensions and mate-distance scoring. Evaluation (`src/engine/evaluate.ts`) combines material, tapered piece-square tables, the bishop pair and pawn structure. The engine runs in a Web Worker so the page never freezes while it thinks.

## Development

```sh
npm test          # Vitest: perft, rules, SAN, evaluation, search, worker, game controller
npm run build     # type-check and bundle
```

Layout:

- `src/engine/` rules, notation, evaluation, search, worker protocol
- `src/ui/` board rendering, game controller, engine client, SVG pieces
- `src/main.ts` wiring
