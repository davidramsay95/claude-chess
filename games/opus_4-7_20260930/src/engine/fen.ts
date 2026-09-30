import {
  Position, Piece, CR_WK, CR_WQ, CR_BK, CR_BQ, squareOf, algebraicOf, squareFromAlgebraic,
} from "./types.js";

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export function parseFen(fen: string): Position {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 4) throw new Error("Invalid FEN: too few fields");
  const [boardStr, turnStr, castleStr, epStr, halfStr, fullStr] = parts;

  const board: (Piece | null)[] = new Array(64).fill(null);
  const rows = boardStr.split("/");
  if (rows.length !== 8) throw new Error("Invalid FEN: board must have 8 ranks");
  for (let i = 0; i < 8; i++) {
    // rows[0] is rank 8 -> internal rank 7
    const rank = 7 - i;
    let file = 0;
    for (const ch of rows[i]) {
      if (ch >= "1" && ch <= "8") {
        file += parseInt(ch, 10);
      } else if ("prnbqkPRNBQK".includes(ch)) {
        if (file > 7) throw new Error("Invalid FEN: file overflow");
        board[squareOf(file, rank)] = ch as Piece;
        file++;
      } else {
        throw new Error(`Invalid FEN: bad char ${ch}`);
      }
    }
    if (file !== 8) throw new Error("Invalid FEN: rank not filled");
  }

  if (turnStr !== "w" && turnStr !== "b") throw new Error("Invalid FEN: bad turn");

  let castling = 0;
  if (castleStr !== "-") {
    for (const c of castleStr) {
      if (c === "K") castling |= CR_WK;
      else if (c === "Q") castling |= CR_WQ;
      else if (c === "k") castling |= CR_BK;
      else if (c === "q") castling |= CR_BQ;
      else throw new Error("Invalid FEN: bad castling");
    }
  }

  let epTarget: number | null = null;
  if (epStr !== "-") epTarget = squareFromAlgebraic(epStr);

  const halfmoveClock = halfStr ? parseInt(halfStr, 10) : 0;
  const fullmoveNumber = fullStr ? parseInt(fullStr, 10) : 1;

  return {
    board,
    turn: turnStr,
    castling,
    epTarget,
    halfmoveClock,
    fullmoveNumber,
  };
}

export function toFen(pos: Position): string {
  const rows: string[] = [];
  for (let i = 0; i < 8; i++) {
    const rank = 7 - i;
    let row = "";
    let empty = 0;
    for (let file = 0; file < 8; file++) {
      const p = pos.board[squareOf(file, rank)];
      if (p) {
        if (empty) { row += empty.toString(); empty = 0; }
        row += p;
      } else empty++;
    }
    if (empty) row += empty.toString();
    rows.push(row);
  }
  let castling = "";
  if (pos.castling & CR_WK) castling += "K";
  if (pos.castling & CR_WQ) castling += "Q";
  if (pos.castling & CR_BK) castling += "k";
  if (pos.castling & CR_BQ) castling += "q";
  if (!castling) castling = "-";
  const ep = pos.epTarget === null ? "-" : algebraicOf(pos.epTarget);
  return `${rows.join("/")} ${pos.turn} ${castling} ${ep} ${pos.halfmoveClock} ${pos.fullmoveNumber}`;
}

export function clonePosition(pos: Position): Position {
  return {
    board: pos.board.slice(),
    turn: pos.turn,
    castling: pos.castling,
    epTarget: pos.epTarget,
    halfmoveClock: pos.halfmoveClock,
    fullmoveNumber: pos.fullmoveNumber,
  };
}
