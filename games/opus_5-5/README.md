# Club Room Chess

Play chess in the browser against a self-written engine. Choose White, Black or Random, and one of four difficulty levels.

## Run it

```bash
npm install
npm run build && npm start      # production, http://localhost:3000
# or
npm run dev                     # development with hot reload
```

Developed and tested on Node 24.

## How to play

- Pick a side and a difficulty, then **Start game**. As Black, the engine moves first and the board is shown from your side.
- Move by clicking a piece and then a highlighted square, or by dragging. Dots mark quiet moves; rings mark captures.
- Castle by moving the king two squares. En passant is shown as a normal target square. A pawn reaching the last rank opens a picker for queen, rook, bishop or knight.
- **Flip board**, **Resign** (asks for confirmation) and **New game** are in the side panel.

All rules are enforced: check, pins, castling rights (including through and out of check), en passant, promotion, checkmate, stalemate, threefold repetition, the fifty-move rule and insufficient material. Repetition and fifty-move draws are applied automatically, as on most online platforms.

## Difficulty levels

| Level  | Behaviour |
|--------|-----------|
| Easy   | Looks one move ahead with heavy randomness. Blunders regularly, but still takes a free queen and mates in one. |
| Medium | 3-ply search with quiescence and mild randomness. Plays opening theory. |
| Hard   | Full-strength search, 1.5s per move. Plays opening theory. |
| Expert | Full-strength search, 3s per move. Plays opening theory. |

## Architecture

```
src/chess/    Rules core: 0x88 board, make/unmake, Zobrist hashing, FEN, SAN, game results
src/engine/   Computer opponent, running in a Web Worker
src/ui/       Pure presentation helpers (orientation, material, move pairs, result text)
src/components/  React client components (setup, board, drag, promotion, side panel)
src/app/      Next.js App Router entry
public/pieces/   Original SVG piece set
```

- **Rules** (`src/chess/position.ts`): pseudo-legal generation filtered by make/unmake legality. Verified by perft against the six standard reference positions.
- **Engine** (`src/engine/`):
  - Search: iterative-deepening alpha-beta with PVS, quiescence search, and a transposition table. Moves are ordered by table move, MVV-LVA captures, killer moves and history. Also uses a check extension, null-move pruning and late move reductions.
  - Evaluation: tapered piece-square evaluation plus pawn-structure, rook and king-safety terms.
  - Opening book: a small main-line book gives variety in the opening.
  - Threading: the search runs in a Web Worker (`engine.worker.ts`), so the UI never blocks.
- **UI**: the only game state is the list of UCI moves; a `ChessGame` is derived from it. Engine replies that arrive after the position changes are discarded.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm test` | Run all tests (Vitest) |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run build` | Production build |
