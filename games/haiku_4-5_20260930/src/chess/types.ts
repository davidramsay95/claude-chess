export type Piece = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P' | 'k' | 'q' | 'r' | 'b' | 'n' | 'p' | null;
export type Color = 'white' | 'black';
export type Square = number; // 0-63

export interface Move {
  from: Square;
  to: Square;
  promotion?: 'Q' | 'R' | 'B' | 'N' | 'q' | 'r' | 'b' | 'n';
}

export interface CastlingRights {
  whiteKingside: boolean;
  whiteQueenside: boolean;
  blackKingside: boolean;
  blackQueenside: boolean;
}

export interface GameState {
  board: Piece[];
  turn: Color;
  castlingRights: CastlingRights;
  enPassantSquare: Square | null;
  halfmoveClock: number;
  fullmoveNumber: number;
}

export interface GamePosition {
  state: GameState;
  history: string[];
  positionHistory: Map<string, number>;
}
