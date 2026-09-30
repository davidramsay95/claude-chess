# Chess Engine

A fully functional chess game with a self-written chess engine, built with React, TypeScript, and Vite.

## Features

- Complete chess rules implementation (castling, en passant, promotion, check, checkmate, stalemate, etc.)
- Self-written chess engine using minimax with alpha-beta pruning
- Four difficulty levels: easy (depth 2), medium (depth 4), hard (depth 6), expert (depth 7)
- Play as white or black
- Web Worker for non-blocking AI computation
- Move history tracking in UCI format
- Export/import game state as JSON
- Full game state validation on import
- Bridge protocol for save/restore integration
- Responsive SVG board with piece symbols
- Comprehensive test suite with perft validation

## How the Engine Works

The chess engine uses the minimax algorithm with alpha-beta pruning to evaluate positions. The engine:

1. **Move Generation**: Generates all legal moves for a position, including special moves (castling, en passant, promotion)
2. **Position Evaluation**: Uses a combination of:
   - Material count (piece values)
   - Positional bonuses (pawn structure, piece placement)
   - Check detection penalty/bonus
3. **Difficulty Levels**:
   - Easy: Searches 2 half-moves ahead
   - Medium: Searches 4 half-moves ahead
   - Hard: Searches 6 half-moves ahead
   - Expert: Searches 7 half-moves ahead

The engine runs in a Web Worker to prevent UI freezing during computation.

## Rules Implemented

✓ Legal move generation for all pieces  
✓ Check and checkmate detection  
✓ Stalemate detection  
✓ Castling (kingside and queenside)  
✓ En passant capture  
✓ Pawn promotion (to Q, R, B, or N)  
✓ Threefold repetition  
✓ Fifty-move rule  
✓ Insufficient material draw  

## Running Locally

```bash
# Install dependencies
npm ci

# Run development server
npm run dev

# Run tests
npm run test

# Build for production
npm run build

# Preview production build
npm run preview
```

## Building for Platform

The platform builds with:

```bash
npm run build -- --base=/play/haiku_4-5_20260930/
```

This generates a static build in the `dist` folder ready to be served.

## Game State Format

The game state follows the standard format defined in `game_state.json`:

```json
{
  "version": 1,
  "startFen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  "playerColor": "white",
  "difficulty": "medium",
  "moves": ["e2e4", "c7c5"],
  "resigned": false
}
```

## Testing

The game includes comprehensive tests:

- **Move Generation**: Validates perft counts at depths 1-4
- **Rules**: Tests castling, en passant, promotion, check, checkmate, stalemate, etc.
- **State Management**: Tests export/import and state validation
- **Bridge Protocol**: Tests message handling and validation

Run tests with `npm run test`.

## Browser Compatibility

Works in all modern browsers supporting:
- ES2020
- Web Workers
- SVG
- LocalStorage (optional)

## Architecture

```
src/
├── chess/
│   ├── types.ts          # Type definitions
│   ├── board.ts          # Board logic and move generation
│   ├── ai.ts             # Minimax engine
│   ├── worker.ts         # Web Worker wrapper
│   └── *.test.ts         # Tests
├── game/
│   ├── gameManager.ts    # Game state management
│   ├── bridge.ts         # Save/restore protocol
│   └── *.test.ts         # Tests
├── components/
│   ├── ChessGame.tsx     # Main React component
│   └── PieceRenderer.tsx # SVG piece rendering
├── styles/
│   └── game.css          # Game styling
├── App.tsx
└── main.tsx
```

## Notes

- The engine uses standard FEN notation for position representation
- Moves are tracked in UCI format (e.g., "e2e4", "e7e8q" for promotion)
- Position history tracks threefold repetition for draw detection
- The fifty-move rule is tracked via halfmove clock
- All piece graphics are rendered using Unicode chess symbols
