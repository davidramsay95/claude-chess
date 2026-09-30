# Opus Chess

A fully playable chess game with a self-written engine, built by Claude Opus 4.6.

## Features

- Play as white or black against the AI engine
- Four difficulty levels: easy, medium, hard, expert
- Complete chess rules: castling, en passant, pawn promotion (all four piece types), check, checkmate, stalemate
- Draw detection: threefold repetition, fifty-move rule, insufficient material
- Move list with standard algebraic notation (SAN)
- Export/import game state as JSON (file download, clipboard, or bridge protocol)
- Self-created Staunton-style SVG piece artwork (no external assets)
- Dark theme with responsive layout
- Engine runs in a Web Worker for non-blocking UI

## Architecture

### Chess core (`src/chess/`)

- **types.ts** - Piece constants, 0x88 board utilities, move flags, UCI conversion
- **board.ts** - FEN parsing/generation, Zobrist hashing, board state management
- **moves.ts** - Pseudo-legal and legal move generation, attack detection
- **game.ts** - Game logic: make/unmake, game-over detection, SAN generation, perft

### Engine (`src/engine/`)

- **evaluate.ts** - Position evaluation with piece-square tables, pawn structure, bishop pair bonus, middlegame/endgame interpolation
- **search.ts** - Alpha-beta with iterative deepening, quiescence search, null move pruning, late move reductions, transposition table, killer moves, history heuristic
- **worker.ts** - Web Worker wrapper for non-blocking search

### UI (`src/ui/`)

- **board-ui.ts** - Board rendering, click-to-move interaction, promotion dialog, import/export, bridge protocol integration
- **pieces.ts** - Inline SVG Staunton piece artwork

### Bridge protocol (`src/bridge.ts`)

Communicates with a parent iframe shell via `postMessage`:

- `ready` - Sent on init and in response to `ping`
- `request-state` -> `state` - Returns current game state and summary
- `load-state` -> `loaded` - Imports a game state with move replay validation

## Development

```bash
npm install
npm run dev      # Start dev server
npm test         # Run tests (vitest)
npm run build    # Production build
```

## Build

The build uses Vite with `base: "./"` for relative asset paths, making the output portable to any sub-path. The platform can also override via `--base`:

```bash
npx vite build --base /play/opus_4-6_20260930/
```

## Tests

58 tests across three suites:

- **perft.test.ts** - 16 perft tests validating move generation correctness at multiple depths and positions
- **game.test.ts** - 27 tests covering castling, en passant, promotion, checkmate, stalemate, threefold repetition, fifty-move rule, insufficient material, SAN generation, UCI parsing
- **bridge.test.ts** - 15 tests for state validation, origin/source checks, move replay, and export/import roundtrip

## Engine difficulty levels

| Level  | Depth | Time   | Features                              |
|--------|-------|--------|---------------------------------------|
| Easy   | 2     | 0.5s   | Material-only eval, random noise      |
| Medium | 3     | 1.5s   | Full eval, small noise                |
| Hard   | 5     | 3.0s   | Null move pruning                     |
| Expert | 7     | 4.5s   | Null move pruning + late move reductions |
