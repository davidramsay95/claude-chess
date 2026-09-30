import {
  type BoardState,
  type Square88,
  type Piece,
  EMPTY,
  WHITE,
  BLACK,
  PAWN,
  KNIGHT,
  BISHOP,
  ROOK,
  QUEEN,
  KING,
  CASTLE_WK,
  CASTLE_WQ,
  CASTLE_BK,
  CASTLE_BQ,
  sq88,
  sqFile,
  sqRank,
  isOnBoard,
  makePiece,
  pieceColor,
  pieceType,
} from "./types.js";

const PIECE_CHARS: Record<string, Piece> = {
  P: makePiece(WHITE, PAWN),
  N: makePiece(WHITE, KNIGHT),
  B: makePiece(WHITE, BISHOP),
  R: makePiece(WHITE, ROOK),
  Q: makePiece(WHITE, QUEEN),
  K: makePiece(WHITE, KING),
  p: makePiece(BLACK, PAWN),
  n: makePiece(BLACK, KNIGHT),
  b: makePiece(BLACK, BISHOP),
  r: makePiece(BLACK, ROOK),
  q: makePiece(BLACK, QUEEN),
  k: makePiece(BLACK, KING),
};

const PIECE_TO_CHAR = " PNBRQK  pnbrqk";

export function pieceToChar(p: Piece): string {
  return PIECE_TO_CHAR[p] ?? "?";
}

export const START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export function createBoard(): BoardState {
  return {
    board: new Uint8Array(128),
    turn: WHITE,
    castling: 0,
    epSquare: -1,
    halfmoveClock: 0,
    fullmoveNumber: 1,
    kings: [0, 0],
  };
}

export function cloneBoard(b: BoardState): BoardState {
  return {
    board: new Uint8Array(b.board),
    turn: b.turn,
    castling: b.castling,
    epSquare: b.epSquare,
    halfmoveClock: b.halfmoveClock,
    fullmoveNumber: b.fullmoveNumber,
    kings: [b.kings[0], b.kings[1]],
  };
}

export function parseFen(fen: string): BoardState {
  const state = createBoard();
  const parts = fen.split(" ");
  if (parts.length < 4) throw new Error("Invalid FEN: not enough fields");

  const ranks = parts[0].split("/");
  if (ranks.length !== 8) throw new Error("Invalid FEN: need 8 ranks");

  for (let r = 7; r >= 0; r--) {
    let file = 0;
    for (const ch of ranks[7 - r]) {
      if (ch >= "1" && ch <= "8") {
        file += parseInt(ch);
      } else {
        const piece = PIECE_CHARS[ch];
        if (piece === undefined) throw new Error(`Invalid FEN: unknown piece '${ch}'`);
        const sq = sq88(r, file);
        state.board[sq] = piece;
        if (pieceType(piece) === KING) {
          state.kings[pieceColor(piece)] = sq;
        }
        file++;
      }
    }
    if (file !== 8) throw new Error("Invalid FEN: rank width not 8");
  }

  state.turn = parts[1] === "b" ? BLACK : WHITE;

  const castleStr = parts[2];
  if (castleStr !== "-") {
    if (castleStr.includes("K")) state.castling |= CASTLE_WK;
    if (castleStr.includes("Q")) state.castling |= CASTLE_WQ;
    if (castleStr.includes("k")) state.castling |= CASTLE_BK;
    if (castleStr.includes("q")) state.castling |= CASTLE_BQ;
  }

  if (parts[3] !== "-") {
    const epFile = parts[3].charCodeAt(0) - 97;
    const epRank = parseInt(parts[3][1]) - 1;
    state.epSquare = sq88(epRank, epFile);
  } else {
    state.epSquare = -1;
  }

  state.halfmoveClock = parts.length > 4 ? parseInt(parts[4]) || 0 : 0;
  state.fullmoveNumber = parts.length > 5 ? parseInt(parts[5]) || 1 : 1;

  return state;
}

export function boardToFen(state: BoardState): string {
  let fen = "";

  for (let r = 7; r >= 0; r--) {
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = state.board[sq88(r, f)];
      if (p === EMPTY) {
        empty++;
      } else {
        if (empty > 0) {
          fen += empty.toString();
          empty = 0;
        }
        fen += pieceToChar(p);
      }
    }
    if (empty > 0) fen += empty.toString();
    if (r > 0) fen += "/";
  }

  fen += " " + (state.turn === WHITE ? "w" : "b");

  let castle = "";
  if (state.castling & CASTLE_WK) castle += "K";
  if (state.castling & CASTLE_WQ) castle += "Q";
  if (state.castling & CASTLE_BK) castle += "k";
  if (state.castling & CASTLE_BQ) castle += "q";
  fen += " " + (castle || "-");

  if (state.epSquare >= 0 && isOnBoard(state.epSquare)) {
    fen +=
      " " +
      String.fromCharCode(97 + sqFile(state.epSquare)) +
      (sqRank(state.epSquare) + 1);
  } else {
    fen += " -";
  }

  fen += " " + state.halfmoveClock;
  fen += " " + state.fullmoveNumber;

  return fen;
}

const ZOBRIST_PIECES: number[][] = [];
const ZOBRIST_CASTLE: number[] = [];
const ZOBRIST_EP: number[] = [];
let ZOBRIST_TURN = 0;

function xorshift32(state: { s: number }): number {
  let x = state.s;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  state.s = x;
  return x >>> 0;
}

(function initZobrist(): void {
  const rng = { s: 0x12345678 };

  for (let i = 0; i < 128; i++) {
    ZOBRIST_PIECES[i] = [];
    for (let p = 0; p < 15; p++) {
      ZOBRIST_PIECES[i][p] = xorshift32(rng);
    }
  }
  for (let i = 0; i < 16; i++) {
    ZOBRIST_CASTLE[i] = xorshift32(rng);
  }
  for (let i = 0; i < 128; i++) {
    ZOBRIST_EP[i] = xorshift32(rng);
  }
  ZOBRIST_TURN = xorshift32(rng);
})();

export function computeHash(state: BoardState): number {
  let h = 0;
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const p = state.board[sq];
    if (p !== EMPTY) {
      h ^= ZOBRIST_PIECES[sq][p];
    }
  }
  if (state.turn === BLACK) h ^= ZOBRIST_TURN;
  h ^= ZOBRIST_CASTLE[state.castling];
  if (state.epSquare >= 0) h ^= ZOBRIST_EP[state.epSquare];
  return h >>> 0;
}

export function updateHash(
  hash: number,
  sq: Square88,
  piece: Piece,
): number {
  return (hash ^ ZOBRIST_PIECES[sq][piece]) >>> 0;
}

export function updateHashCastle(
  hash: number,
  oldCastle: number,
  newCastle: number,
): number {
  return (hash ^ ZOBRIST_CASTLE[oldCastle] ^ ZOBRIST_CASTLE[newCastle]) >>> 0;
}

export function updateHashEp(
  hash: number,
  oldEp: number,
  newEp: number,
): number {
  let h = hash;
  if (oldEp >= 0) h ^= ZOBRIST_EP[oldEp];
  if (newEp >= 0) h ^= ZOBRIST_EP[newEp];
  return h >>> 0;
}

export function updateHashTurn(hash: number): number {
  return (hash ^ ZOBRIST_TURN) >>> 0;
}

export { ZOBRIST_PIECES, ZOBRIST_CASTLE, ZOBRIST_EP, ZOBRIST_TURN };
