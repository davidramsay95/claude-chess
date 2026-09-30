import {
  Position, Piece, Move, DetailedMove, Square, Color, CR_WK, CR_WQ, CR_BK, CR_BQ,
  colorOf, isWhitePiece, pieceType, fileOf, rankOf, squareOf,
} from "./types.js";
import { clonePosition } from "./fen.js";

const KNIGHT_DELTAS: [number, number][] = [
  [2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2],
];
const KING_DELTAS: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];
const BISHOP_DIRS: [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ROOK_DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const QUEEN_DIRS: [number, number][] = [...BISHOP_DIRS, ...ROOK_DIRS];

function inBounds(file: number, rank: number): boolean {
  return file >= 0 && file <= 7 && rank >= 0 && rank <= 7;
}

// Is the given square attacked by any piece of the given attacker color?
export function isSquareAttacked(pos: Position, sq: Square, byColor: Color): boolean {
  const f = fileOf(sq);
  const r = rankOf(sq);

  // Pawn attacks. A white pawn attacks squares one rank up and one file left/right.
  // So "byColor" white pawn on (f-1, r-1) or (f+1, r-1) attacks (f, r).
  const pawnDir = byColor === "w" ? -1 : 1;
  for (const df of [-1, 1]) {
    const pf = f + df;
    const pr = r + pawnDir;
    if (inBounds(pf, pr)) {
      const p = pos.board[squareOf(pf, pr)];
      if (p && colorOf(p) === byColor && pieceType(p) === "p") return true;
    }
  }

  // Knights
  for (const [dr, df] of KNIGHT_DELTAS) {
    const nf = f + df;
    const nr = r + dr;
    if (inBounds(nf, nr)) {
      const p = pos.board[squareOf(nf, nr)];
      if (p && colorOf(p) === byColor && pieceType(p) === "n") return true;
    }
  }

  // King
  for (const [dr, df] of KING_DELTAS) {
    const nf = f + df;
    const nr = r + dr;
    if (inBounds(nf, nr)) {
      const p = pos.board[squareOf(nf, nr)];
      if (p && colorOf(p) === byColor && pieceType(p) === "k") return true;
    }
  }

  // Sliding: bishops/queens on diagonals, rooks/queens on orthogonals.
  for (const [dr, df] of BISHOP_DIRS) {
    let nf = f + df;
    let nr = r + dr;
    while (inBounds(nf, nr)) {
      const p = pos.board[squareOf(nf, nr)];
      if (p) {
        if (colorOf(p) === byColor) {
          const t = pieceType(p);
          if (t === "b" || t === "q") return true;
        }
        break;
      }
      nf += df; nr += dr;
    }
  }
  for (const [dr, df] of ROOK_DIRS) {
    let nf = f + df;
    let nr = r + dr;
    while (inBounds(nf, nr)) {
      const p = pos.board[squareOf(nf, nr)];
      if (p) {
        if (colorOf(p) === byColor) {
          const t = pieceType(p);
          if (t === "r" || t === "q") return true;
        }
        break;
      }
      nf += df; nr += dr;
    }
  }

  return false;
}

export function findKing(pos: Position, color: Color): Square | -1 {
  const k: Piece = color === "w" ? "K" : "k";
  for (let i = 0; i < 64; i++) if (pos.board[i] === k) return i;
  return -1;
}

export function inCheck(pos: Position, color: Color): boolean {
  const ks = findKing(pos, color);
  if (ks < 0) return false;
  return isSquareAttacked(pos, ks, color === "w" ? "b" : "w");
}

// Generate all pseudo-legal moves for the side to move.
export function generatePseudoLegalMoves(pos: Position): Move[] {
  const moves: Move[] = [];
  const me = pos.turn;

  for (let sq = 0; sq < 64; sq++) {
    const p = pos.board[sq];
    if (!p) continue;
    if (colorOf(p) !== me) continue;
    const f = fileOf(sq);
    const r = rankOf(sq);
    const t = pieceType(p);

    if (t === "p") {
      const dir = isWhitePiece(p) ? 1 : -1;
      const startRank = isWhitePiece(p) ? 1 : 6;
      const promoRank = isWhitePiece(p) ? 7 : 0;
      const oneStepRank = r + dir;
      // Forward one
      if (inBounds(f, oneStepRank) && pos.board[squareOf(f, oneStepRank)] === null) {
        const to = squareOf(f, oneStepRank);
        if (oneStepRank === promoRank) {
          for (const promo of ["q", "r", "b", "n"] as const) moves.push({ from: sq, to, promo });
        } else {
          moves.push({ from: sq, to });
          // Double push
          if (r === startRank) {
            const twoRank = r + 2 * dir;
            if (pos.board[squareOf(f, twoRank)] === null) {
              moves.push({ from: sq, to: squareOf(f, twoRank) });
            }
          }
        }
      }
      // Captures
      for (const df of [-1, 1]) {
        const nf = f + df;
        const nr = r + dir;
        if (!inBounds(nf, nr)) continue;
        const to = squareOf(nf, nr);
        const target = pos.board[to];
        if (target && colorOf(target) !== me) {
          if (nr === promoRank) {
            for (const promo of ["q", "r", "b", "n"] as const) moves.push({ from: sq, to, promo });
          } else {
            moves.push({ from: sq, to });
          }
        } else if (pos.epTarget !== null && to === pos.epTarget) {
          moves.push({ from: sq, to });
        }
      }
    } else if (t === "n") {
      for (const [dr, df] of KNIGHT_DELTAS) {
        const nf = f + df; const nr = r + dr;
        if (!inBounds(nf, nr)) continue;
        const to = squareOf(nf, nr);
        const target = pos.board[to];
        if (!target || colorOf(target) !== me) moves.push({ from: sq, to });
      }
    } else if (t === "b" || t === "r" || t === "q") {
      const dirs = t === "b" ? BISHOP_DIRS : t === "r" ? ROOK_DIRS : QUEEN_DIRS;
      for (const [dr, df] of dirs) {
        let nf = f + df; let nr = r + dr;
        while (inBounds(nf, nr)) {
          const to = squareOf(nf, nr);
          const target = pos.board[to];
          if (!target) {
            moves.push({ from: sq, to });
          } else {
            if (colorOf(target) !== me) moves.push({ from: sq, to });
            break;
          }
          nf += df; nr += dr;
        }
      }
    } else if (t === "k") {
      for (const [dr, df] of KING_DELTAS) {
        const nf = f + df; const nr = r + dr;
        if (!inBounds(nf, nr)) continue;
        const to = squareOf(nf, nr);
        const target = pos.board[to];
        if (!target || colorOf(target) !== me) moves.push({ from: sq, to });
      }
      // Castling. King is on its starting square; conditions checked here (rights + emptiness);
      // check safety (no passing through check) is enforced when filtering to legal moves.
      if (me === "w" && sq === squareOf(4, 0)) {
        if ((pos.castling & CR_WK) && pos.board[squareOf(5, 0)] === null && pos.board[squareOf(6, 0)] === null && pos.board[squareOf(7, 0)] === "R") {
          moves.push({ from: sq, to: squareOf(6, 0) });
        }
        if ((pos.castling & CR_WQ) && pos.board[squareOf(3, 0)] === null && pos.board[squareOf(2, 0)] === null && pos.board[squareOf(1, 0)] === null && pos.board[squareOf(0, 0)] === "R") {
          moves.push({ from: sq, to: squareOf(2, 0) });
        }
      } else if (me === "b" && sq === squareOf(4, 7)) {
        if ((pos.castling & CR_BK) && pos.board[squareOf(5, 7)] === null && pos.board[squareOf(6, 7)] === null && pos.board[squareOf(7, 7)] === "r") {
          moves.push({ from: sq, to: squareOf(6, 7) });
        }
        if ((pos.castling & CR_BQ) && pos.board[squareOf(3, 7)] === null && pos.board[squareOf(2, 7)] === null && pos.board[squareOf(1, 7)] === null && pos.board[squareOf(0, 7)] === "r") {
          moves.push({ from: sq, to: squareOf(2, 7) });
        }
      }
    }
  }

  return moves;
}

// Update castling rights based on the move that just happened (from/to squares).
function updateCastlingRights(pos: Position, from: Square, to: Square): void {
  // If king or rook moves off its home square, or an enemy captures a rook on its home square, drop rights.
  if (from === squareOf(4, 0)) pos.castling &= ~(CR_WK | CR_WQ);
  if (from === squareOf(4, 7)) pos.castling &= ~(CR_BK | CR_BQ);
  if (from === squareOf(0, 0) || to === squareOf(0, 0)) pos.castling &= ~CR_WQ;
  if (from === squareOf(7, 0) || to === squareOf(7, 0)) pos.castling &= ~CR_WK;
  if (from === squareOf(0, 7) || to === squareOf(0, 7)) pos.castling &= ~CR_BQ;
  if (from === squareOf(7, 7) || to === squareOf(7, 7)) pos.castling &= ~CR_BK;
}

// Apply a move to a NEW position (does not mutate input). Returns the new position and details.
export function makeMove(pos: Position, mv: Move): { next: Position; detail: DetailedMove } {
  const next = clonePosition(pos);
  const piece = next.board[mv.from];
  if (!piece) throw new Error(`makeMove: no piece at from ${mv.from}`);
  const me = colorOf(piece);
  const t = pieceType(piece);

  let captured: Piece | undefined;
  let isEnPassant = false;
  let castleSide: DetailedMove["isCastle"] = null;
  let isDoublePush = false;

  // En passant capture
  if (t === "p" && next.epTarget === mv.to && mv.from !== mv.to && fileOf(mv.from) !== fileOf(mv.to)) {
    // The captured pawn is on the square behind the target from the mover's perspective.
    const capSq = squareOf(fileOf(mv.to), rankOf(mv.from));
    const capPiece = next.board[capSq];
    if (capPiece) {
      captured = capPiece;
      next.board[capSq] = null;
      isEnPassant = true;
    }
  } else if (next.board[mv.to]) {
    captured = next.board[mv.to] as Piece;
  }

  // Castling: king moves two files.
  if (t === "k" && Math.abs(fileOf(mv.to) - fileOf(mv.from)) === 2) {
    const rank = rankOf(mv.from);
    if (fileOf(mv.to) === 6) {
      // Kingside
      next.board[squareOf(5, rank)] = next.board[squareOf(7, rank)];
      next.board[squareOf(7, rank)] = null;
      castleSide = me === "w" ? "K" : "k";
    } else if (fileOf(mv.to) === 2) {
      // Queenside
      next.board[squareOf(3, rank)] = next.board[squareOf(0, rank)];
      next.board[squareOf(0, rank)] = null;
      castleSide = me === "w" ? "Q" : "q";
    }
  }

  // Move the piece
  next.board[mv.from] = null;
  if (mv.promo && t === "p") {
    const map: Record<string, Piece> = me === "w"
      ? { q: "Q", r: "R", b: "B", n: "N" }
      : { q: "q", r: "r", b: "b", n: "n" };
    next.board[mv.to] = map[mv.promo];
  } else {
    next.board[mv.to] = piece;
  }

  // Set en passant target for a double pawn push
  next.epTarget = null;
  if (t === "p" && Math.abs(rankOf(mv.to) - rankOf(mv.from)) === 2) {
    next.epTarget = squareOf(fileOf(mv.from), (rankOf(mv.from) + rankOf(mv.to)) / 2);
    isDoublePush = true;
  }

  // Update castling rights
  updateCastlingRights(next, mv.from, mv.to);

  // Halfmove clock: reset on pawn move or capture, else increment
  if (t === "p" || captured) next.halfmoveClock = 0;
  else next.halfmoveClock++;

  if (me === "b") next.fullmoveNumber++;
  next.turn = me === "w" ? "b" : "w";

  const detail: DetailedMove = {
    from: mv.from,
    to: mv.to,
    promo: mv.promo,
    piece,
    captured,
    isEnPassant,
    isCastle: castleSide,
    isDoublePush,
  };
  return { next, detail };
}

// Filter pseudo-legal moves to legal moves (king not in check after move; castling constraints).
export function generateLegalMoves(pos: Position): Move[] {
  const me = pos.turn;
  const opp: Color = me === "w" ? "b" : "w";
  const pseudo = generatePseudoLegalMoves(pos);
  const legal: Move[] = [];
  for (const mv of pseudo) {
    const piece = pos.board[mv.from];
    if (!piece) continue;
    // Castling: cannot castle out of, through, or into check.
    if (pieceType(piece) === "k" && Math.abs(fileOf(mv.to) - fileOf(mv.from)) === 2) {
      const rank = rankOf(mv.from);
      const kingFrom = mv.from;
      const throughFile = (fileOf(mv.from) + fileOf(mv.to)) / 2;
      const throughSq = squareOf(throughFile, rank);
      const kingTo = mv.to;
      if (isSquareAttacked(pos, kingFrom, opp)) continue;
      if (isSquareAttacked(pos, throughSq, opp)) continue;
      if (isSquareAttacked(pos, kingTo, opp)) continue;
    }
    const { next } = makeMove(pos, mv);
    if (!inCheck(next, me)) legal.push(mv);
  }
  return legal;
}

// Perft: raw node count at a given depth. Used only for correctness testing.
export function perft(pos: Position, depth: number): number {
  if (depth === 0) return 1;
  const moves = generateLegalMoves(pos);
  if (depth === 1) return moves.length;
  let count = 0;
  for (const mv of moves) {
    const { next } = makeMove(pos, mv);
    count += perft(next, depth - 1);
  }
  return count;
}

export function uciOfMove(mv: Move): string {
  const from = String.fromCharCode(97 + fileOf(mv.from)) + (rankOf(mv.from) + 1).toString();
  const to = String.fromCharCode(97 + fileOf(mv.to)) + (rankOf(mv.to) + 1).toString();
  return from + to + (mv.promo ?? "");
}

export function moveFromUci(pos: Position, uci: string): Move | null {
  if (uci.length < 4 || uci.length > 5) return null;
  const from = squareOf(uci.charCodeAt(0) - 97, parseInt(uci[1], 10) - 1);
  const to = squareOf(uci.charCodeAt(2) - 97, parseInt(uci[3], 10) - 1);
  const promo = uci.length === 5 ? (uci[4] as "q" | "r" | "b" | "n") : undefined;
  const legal = generateLegalMoves(pos);
  for (const mv of legal) {
    if (mv.from === from && mv.to === to && (mv.promo ?? undefined) === (promo ?? undefined)) return mv;
  }
  return null;
}
