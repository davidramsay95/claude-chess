import {
  type BoardState,
  type Move,
  type UndoInfo,
  type Color,
  type PieceType,
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
  FLAG_CAPTURE,
  FLAG_EP,
  FLAG_CASTLE,
  FLAG_PAWN_DOUBLE,
  sq88,
  sqRank,
  sqFile,
  pieceColor,
  pieceType,
  makePiece,
  algToSq88,
} from "./types.js";
import {
  parseFen,
  boardToFen,
  computeHash,
  updateHash,
  updateHashCastle,
  updateHashEp,
  updateHashTurn,
  START_FEN,
} from "./board.js";
import {
  generateLegalMoves,
  isInCheck,
} from "./moves.js";

const CASTLING_MASK = new Uint8Array(128);
(function initCastlingMask(): void {
  CASTLING_MASK.fill(15);
  CASTLING_MASK[sq88(0, 0)] = ~CASTLE_WQ & 0x0f;
  CASTLING_MASK[sq88(0, 4)] = ~(CASTLE_WK | CASTLE_WQ) & 0x0f;
  CASTLING_MASK[sq88(0, 7)] = ~CASTLE_WK & 0x0f;
  CASTLING_MASK[sq88(7, 0)] = ~CASTLE_BQ & 0x0f;
  CASTLING_MASK[sq88(7, 4)] = ~(CASTLE_BK | CASTLE_BQ) & 0x0f;
  CASTLING_MASK[sq88(7, 7)] = ~CASTLE_BK & 0x0f;
})();

export class ChessGame {
  state: BoardState;
  hash: number;
  history: UndoInfo[] = [];
  positionCounts: Map<number, number> = new Map();
  legalMoves: Move[] | null = null;

  constructor(fen: string = START_FEN) {
    this.state = parseFen(fen);
    this.hash = computeHash(this.state);
    this.incrementPositionCount();
  }

  private incrementPositionCount(): void {
    const key = this.hash;
    this.positionCounts.set(key, (this.positionCounts.get(key) ?? 0) + 1);
  }

  private decrementPositionCount(): void {
    const key = this.hash;
    const count = (this.positionCounts.get(key) ?? 1) - 1;
    if (count <= 0) {
      this.positionCounts.delete(key);
    } else {
      this.positionCounts.set(key, count);
    }
  }

  getLegalMoves(): Move[] {
    if (this.legalMoves === null) {
      this.legalMoves = generateLegalMoves(this.state);
    }
    return this.legalMoves;
  }

  makeMove(move: Move): void {
    const s = this.state;
    const undo: UndoInfo = {
      move,
      castling: s.castling,
      epSquare: s.epSquare,
      halfmoveClock: s.halfmoveClock,
      hash: this.hash,
    };
    this.history.push(undo);

    let h = this.hash;

    h = updateHash(h, move.from, move.piece);

    if (move.flags & FLAG_CAPTURE) {
      if (move.flags & FLAG_EP) {
        const epPawnSq =
          s.turn === WHITE ? move.to - 16 : move.to + 16;
        h = updateHash(h, epPawnSq, s.board[epPawnSq]);
        s.board[epPawnSq] = EMPTY;
      } else {
        h = updateHash(h, move.to, s.board[move.to]);
      }
    }

    const placed = move.promotion
      ? makePiece(s.turn, move.promotion)
      : move.piece;
    s.board[move.from] = EMPTY;
    s.board[move.to] = placed;
    h = updateHash(h, move.to, placed);

    if (pieceType(move.piece) === KING) {
      s.kings[s.turn] = move.to;
    }

    if (move.flags & FLAG_CASTLE) {
      const isKingside = move.to > move.from;
      const rookFrom = isKingside
        ? sq88(sqRank(move.from), 7)
        : sq88(sqRank(move.from), 0);
      const rookTo = isKingside
        ? sq88(sqRank(move.from), 5)
        : sq88(sqRank(move.from), 3);
      const rook = s.board[rookFrom];
      h = updateHash(h, rookFrom, rook);
      s.board[rookFrom] = EMPTY;
      s.board[rookTo] = rook;
      h = updateHash(h, rookTo, rook);
    }

    const oldCastling = s.castling;
    s.castling &= CASTLING_MASK[move.from] & CASTLING_MASK[move.to];
    if (s.castling !== oldCastling) {
      h = updateHashCastle(h, oldCastling, s.castling);
    }

    const oldEp = s.epSquare;
    if (move.flags & FLAG_PAWN_DOUBLE) {
      s.epSquare = s.turn === WHITE ? move.from + 16 : move.from - 16;
    } else {
      s.epSquare = -1;
    }
    h = updateHashEp(h, oldEp, s.epSquare);

    if (pieceType(move.piece) === PAWN || (move.flags & FLAG_CAPTURE)) {
      s.halfmoveClock = 0;
    } else {
      s.halfmoveClock++;
    }

    if (s.turn === BLACK) {
      s.fullmoveNumber++;
    }

    s.turn = (1 - s.turn) as Color;
    h = updateHashTurn(h);

    this.hash = h >>> 0;
    this.legalMoves = null;
    this.incrementPositionCount();
  }

  unmakeMove(): void {
    const undo = this.history.pop();
    if (!undo) return;

    this.decrementPositionCount();

    const s = this.state;
    const move = undo.move;

    s.turn = (1 - s.turn) as Color;

    if (s.turn === BLACK) {
      s.fullmoveNumber--;
    }

    s.castling = undo.castling;
    s.epSquare = undo.epSquare;
    s.halfmoveClock = undo.halfmoveClock;

    if (move.flags & FLAG_CASTLE) {
      const isKingside = move.to > move.from;
      const rookFrom = isKingside
        ? sq88(sqRank(move.from), 7)
        : sq88(sqRank(move.from), 0);
      const rookTo = isKingside
        ? sq88(sqRank(move.from), 5)
        : sq88(sqRank(move.from), 3);
      s.board[rookFrom] = s.board[rookTo];
      s.board[rookTo] = EMPTY;
    }

    s.board[move.from] = move.piece;
    if (pieceType(move.piece) === KING) {
      s.kings[s.turn] = move.from;
    }

    if (move.flags & FLAG_EP) {
      s.board[move.to] = EMPTY;
      const epPawnSq =
        s.turn === WHITE ? move.to - 16 : move.to + 16;
      s.board[epPawnSq] = move.captured;
    } else if (move.flags & FLAG_CAPTURE) {
      s.board[move.to] = move.captured;
    } else {
      s.board[move.to] = EMPTY;
    }

    this.hash = undo.hash;
    this.legalMoves = null;
  }

  isCheck(): boolean {
    return isInCheck(this.state, this.state.turn);
  }

  isCheckmate(): boolean {
    return this.isCheck() && this.getLegalMoves().length === 0;
  }

  isStalemate(): boolean {
    return !this.isCheck() && this.getLegalMoves().length === 0;
  }

  isThreefoldRepetition(): boolean {
    return (this.positionCounts.get(this.hash) ?? 0) >= 3;
  }

  isFiftyMoveRule(): boolean {
    return this.state.halfmoveClock >= 100;
  }

  isInsufficientMaterial(): boolean {
    const b = this.state.board;
    let wBishops = 0,
      bBishops = 0,
      wKnights = 0,
      bKnights = 0;
    let wBishopColorSum = 0,
      bBishopColorSum = 0;
    let otherPieces = false;

    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) continue;
      const p = b[sq];
      if (p === EMPTY) continue;
      const pt = pieceType(p);
      const c = pieceColor(p);

      if (pt === KING) continue;
      if (pt === PAWN || pt === ROOK || pt === QUEEN) {
        otherPieces = true;
        break;
      }

      const sqColor = (sqRank(sq) + sqFile(sq)) & 1;
      if (pt === BISHOP) {
        if (c === WHITE) {
          wBishops++;
          wBishopColorSum += sqColor;
        } else {
          bBishops++;
          bBishopColorSum += sqColor;
        }
      } else if (pt === KNIGHT) {
        if (c === WHITE) wKnights++;
        else bKnights++;
      }
    }

    if (otherPieces) return false;

    const wMinors = wBishops + wKnights;
    const bMinors = bBishops + bKnights;

    if (wMinors === 0 && bMinors === 0) return true;
    if (wMinors === 1 && bMinors === 0) return true;
    if (wMinors === 0 && bMinors === 1) return true;
    if (
      wKnights === 0 &&
      bKnights === 0 &&
      wBishops > 0 &&
      bBishops > 0
    ) {
      const wAllSame = wBishopColorSum === 0 || wBishopColorSum === wBishops;
      const bAllSame = bBishopColorSum === 0 || bBishopColorSum === bBishops;
      if (wAllSame && bAllSame) {
        const wOnLight = wBishopColorSum > 0;
        const bOnLight = bBishopColorSum > 0;
        if (wOnLight === bOnLight) return true;
      }
    }

    return false;
  }

  isDraw(): boolean {
    return (
      this.isStalemate() ||
      this.isThreefoldRepetition() ||
      this.isFiftyMoveRule() ||
      this.isInsufficientMaterial()
    );
  }

  isGameOver(): boolean {
    return this.isCheckmate() || this.isDraw();
  }

  getResult(): string {
    if (this.isCheckmate()) {
      return this.state.turn === WHITE ? "0-1" : "1-0";
    }
    if (this.isDraw()) return "1/2-1/2";
    return "*";
  }

  findMoveByUci(uci: string): Move | null {
    const from = algToSq88(uci.substring(0, 2));
    const to = algToSq88(uci.substring(2, 4));
    const promChar = uci.length > 4 ? uci[4] : "";
    const promMap: Record<string, PieceType> = {
      n: KNIGHT,
      b: BISHOP,
      r: ROOK,
      q: QUEEN,
    };
    const prom = promChar ? promMap[promChar] ?? 0 : 0;

    const legal = this.getLegalMoves();
    for (const m of legal) {
      if (m.from === from && m.to === to) {
        if (m.promotion) {
          if (m.promotion === prom) return m;
        } else {
          return m;
        }
      }
    }
    return null;
  }

  moveToSan(move: Move): string {
    const pt = pieceType(move.piece);
    const legal = this.getLegalMoves();
    let san = "";

    if (move.flags & FLAG_CASTLE) {
      san = move.to > move.from ? "O-O" : "O-O-O";
    } else if (pt === PAWN) {
      if (move.flags & FLAG_CAPTURE) {
        san = String.fromCharCode(97 + sqFile(move.from)) + "x";
      }
      san +=
        String.fromCharCode(97 + sqFile(move.to)) + (sqRank(move.to) + 1);
      if (move.promotion) {
        san += "=" + " NBRQ"[move.promotion];
      }
    } else {
      const pieceChars = "  NBRQK";
      san = pieceChars[pt];

      const ambiguous = legal.filter(
        (m) =>
          m.from !== move.from &&
          m.to === move.to &&
          pieceType(m.piece) === pt,
      );
      if (ambiguous.length > 0) {
        const sameFile = ambiguous.some(
          (m) => sqFile(m.from) === sqFile(move.from),
        );
        const sameRank = ambiguous.some(
          (m) => sqRank(m.from) === sqRank(move.from),
        );
        if (!sameFile) {
          san += String.fromCharCode(97 + sqFile(move.from));
        } else if (!sameRank) {
          san += String(sqRank(move.from) + 1);
        } else {
          san +=
            String.fromCharCode(97 + sqFile(move.from)) +
            (sqRank(move.from) + 1);
        }
      }

      if (move.flags & FLAG_CAPTURE) san += "x";
      san +=
        String.fromCharCode(97 + sqFile(move.to)) + (sqRank(move.to) + 1);
    }

    this.makeMove(move);
    if (this.isCheckmate()) {
      san += "#";
    } else if (this.isCheck()) {
      san += "+";
    }
    this.unmakeMove();

    return san;
  }

  fen(): string {
    return boardToFen(this.state);
  }

  perft(depth: number): number {
    if (depth === 0) return 1;
    const moves = generateLegalMoves(this.state);
    let nodes = 0;
    for (const move of moves) {
      this.makeMove(move);
      nodes += this.perft(depth - 1);
      this.unmakeMove();
    }
    return nodes;
  }
}
