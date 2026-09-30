import type { CastlingRights, Color, GameState, Piece, PieceType, Square } from "./types";
import { STARTING_FEN } from "./types";

const FILE_A = "a".charCodeAt(0);
const RANK_1 = "1".charCodeAt(0);

/** Converts an algebraic square (e.g. `'e4'`) to a 0-63 board index. */
export function squareToIndex(square: Square): number {
  const file = square.charCodeAt(0) - FILE_A;
  const rank = square.charCodeAt(1) - RANK_1;
  return rank * 8 + file;
}

/** Converts a 0-63 board index back to algebraic notation. */
export function indexToSquare(index: number): Square {
  const file = index & 7;
  const rank = index >> 3;
  return String.fromCharCode(FILE_A + file) + String.fromCharCode(RANK_1 + rank);
}

export function isValidSquare(square: string): boolean {
  if (square.length !== 2) return false;
  const file = square.charCodeAt(0) - FILE_A;
  const rank = square.charCodeAt(1) - RANK_1;
  return file >= 0 && file <= 7 && rank >= 0 && rank <= 7;
}

export function fileOf(index: number): number {
  return index & 7;
}

export function rankOf(index: number): number {
  return index >> 3;
}

const PIECE_LETTERS: Record<PieceType, string> = {
  p: "p",
  n: "n",
  b: "b",
  r: "r",
  q: "q",
  k: "k",
};

function pieceToFenChar(piece: Piece): string {
  const letter = PIECE_LETTERS[piece.type];
  return piece.color === "white" ? letter.toUpperCase() : letter;
}

function fenCharToPiece(char: string): Piece {
  const type = char.toLowerCase() as PieceType;
  const color: Color = char === char.toUpperCase() ? "white" : "black";
  return { type, color };
}

/** Builds the repetition/position key: board + turn + castling + en passant. */
export function positionKey(
  board: readonly (Piece | null)[],
  turn: Color,
  castlingRights: CastlingRights,
  enPassantTarget: Square | null,
): string {
  let boardKey = "";
  for (let i = 0; i < 64; i++) {
    const piece = board[i];
    boardKey += piece ? pieceToFenChar(piece) : ".";
  }
  const castlingKey =
    (castlingRights.whiteKingside ? "K" : "") +
    (castlingRights.whiteQueenside ? "Q" : "") +
    (castlingRights.blackKingside ? "k" : "") +
    (castlingRights.blackQueenside ? "q" : "");
  return `${boardKey}|${turn}|${castlingKey || "-"}|${enPassantTarget ?? "-"}`;
}

/**
 * Parses a FEN string into a fresh `GameState`. Throws a descriptive `Error`
 * if the FEN is malformed, so callers such as the worker's request handler
 * can catch it and report a clean error instead of crashing.
 */
export function parseFen(fen: string): GameState {
  const fields = fen.trim().split(/\s+/);
  if (fields.length < 4) {
    throw new Error(`Invalid FEN: expected at least 4 fields, got ${fields.length}`);
  }
  const [placement, turnField, castlingField, epField, halfmoveField, fullmoveField] = fields;

  const ranks = placement.split("/");
  if (ranks.length !== 8) {
    throw new Error(`Invalid FEN: expected 8 ranks, got ${ranks.length}`);
  }

  const board: (Piece | null)[] = new Array(64).fill(null);
  for (let rankRow = 0; rankRow < 8; rankRow++) {
    const rank = 7 - rankRow; // FEN lists rank 8 first.
    const rowChars = ranks[rankRow];
    let file = 0;
    for (const char of rowChars) {
      if (file > 8) {
        throw new Error(`Invalid FEN: rank "${rowChars}" overflows the board`);
      }
      if (/[1-8]/.test(char)) {
        file += Number(char);
      } else if (/[pnbrqkPNBRQK]/.test(char)) {
        if (file > 7) {
          throw new Error(`Invalid FEN: rank "${rowChars}" overflows the board`);
        }
        board[rank * 8 + file] = fenCharToPiece(char);
        file += 1;
      } else {
        throw new Error(`Invalid FEN: unexpected character "${char}" in placement`);
      }
    }
    if (file !== 8) {
      throw new Error(`Invalid FEN: rank "${rowChars}" does not cover 8 files`);
    }
  }

  if (turnField !== "w" && turnField !== "b") {
    throw new Error(`Invalid FEN: turn must be "w" or "b", got "${turnField}"`);
  }
  const turn: Color = turnField === "w" ? "white" : "black";

  if (castlingField !== "-" && (castlingField === "" || !/^K?Q?k?q?$/.test(castlingField))) {
    throw new Error(`Invalid FEN: malformed castling field "${castlingField}"`);
  }
  const castlingRights: CastlingRights = {
    whiteKingside: castlingField.includes("K"),
    whiteQueenside: castlingField.includes("Q"),
    blackKingside: castlingField.includes("k"),
    blackQueenside: castlingField.includes("q"),
  };

  let enPassantTarget: Square | null = null;
  if (epField !== "-") {
    if (!isValidSquare(epField)) {
      throw new Error(`Invalid FEN: malformed en passant target "${epField}"`);
    }
    enPassantTarget = epField;
  }

  const halfmoveClock = halfmoveField !== undefined ? Number(halfmoveField) : 0;
  const fullmoveNumber = fullmoveField !== undefined ? Number(fullmoveField) : 1;
  if (!Number.isInteger(halfmoveClock) || halfmoveClock < 0) {
    throw new Error(`Invalid FEN: malformed halfmove clock "${halfmoveField}"`);
  }
  if (!Number.isInteger(fullmoveNumber) || fullmoveNumber < 1) {
    throw new Error(`Invalid FEN: malformed fullmove number "${fullmoveField}"`);
  }

  const key = positionKey(board, turn, castlingRights, enPassantTarget);

  return {
    board,
    turn,
    castlingRights,
    enPassantTarget,
    halfmoveClock,
    fullmoveNumber,
    positionHistory: [key],
  };
}

/** Serializes a `GameState` back to a FEN string. */
export function toFen(state: GameState): string {
  const rows: string[] = [];
  for (let rank = 7; rank >= 0; rank--) {
    let row = "";
    let empty = 0;
    for (let file = 0; file < 8; file++) {
      const piece = state.board[rank * 8 + file];
      if (!piece) {
        empty += 1;
        continue;
      }
      if (empty > 0) {
        row += String(empty);
        empty = 0;
      }
      row += pieceToFenChar(piece);
    }
    if (empty > 0) row += String(empty);
    rows.push(row);
  }
  const placement = rows.join("/");
  const turnField = state.turn === "white" ? "w" : "b";
  const castling =
    (state.castlingRights.whiteKingside ? "K" : "") +
    (state.castlingRights.whiteQueenside ? "Q" : "") +
    (state.castlingRights.blackKingside ? "k" : "") +
    (state.castlingRights.blackQueenside ? "q" : "");
  const castlingField = castling.length > 0 ? castling : "-";
  const epField = state.enPassantTarget ?? "-";

  return `${placement} ${turnField} ${castlingField} ${epField} ${state.halfmoveClock} ${state.fullmoveNumber}`;
}

export function createStartingState(): GameState {
  return parseFen(STARTING_FEN);
}
