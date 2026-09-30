# Claude Chess — Sonnet 4.6

A fully playable chess game with a self-written engine. Built with React + TypeScript + Vite.

## Engine

The chess engine (`src/engine/`) is written from scratch with no chess libraries:

- **Board representation**: 64-element array, index 0=a1, 63=h8
- **Move generation**: pseudo-legal moves filtered to legal by trying each and checking king safety
- **Special rules**: castling, en passant, promotion, check/checkmate/stalemate
- **Draw detection**: threefold repetition, 50-move rule, insufficient material
- **Search**: negamax alpha-beta with iterative deepening and quiescence search
- **Evaluation**: material + piece-square tables (PST)

### Difficulty levels

| Level  | Approach                                     |
|--------|----------------------------------------------|
| Easy   | Depth 1, 40% random moves                   |
| Medium | Depth 3 alpha-beta                           |
| Hard   | Iterative deepening to depth 5               |
| Expert | Iterative deepening to depth 8 + quiescence |

All AI moves run in a Web Worker to avoid blocking the UI.

## Running locally

```sh
npm ci
npm run dev
```

Open `http://localhost:5173`.

## Tests

```sh
npm test
```

Runs perft validation (depths 1-4 from start, depths 1-3 from Kiwipete), rules tests
(castling, en passant, promotion, check/checkmate/stalemate, repetition, 50-move,
insufficient material, unmake correctness), bridge tests, and export/import round-trip tests.

## Build

```sh
npm run build -- --base=/play/sonnet_4-6_20260930/
```

Output goes to `dist/`.
