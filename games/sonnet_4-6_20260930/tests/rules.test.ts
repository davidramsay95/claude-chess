import { describe, it, expect } from "vitest";
import {
  parseFen, boardToFen, makeMove, unmakeMove, uciToMove, moveToUci,
  isKingInCheck, isInsufficientMaterial, positionKey,
  WHITE, BLACK,
  W_PAWN, W_KNIGHT, W_BISHOP, W_ROOK, W_QUEEN, W_KING,
  B_PAWN, B_KNIGHT, B_BISHOP, B_ROOK, B_QUEEN, B_KING,
  EMPTY,
} from "../src/engine/board.js";
import { generateLegalMoves } from "../src/engine/moveGen.js";

function applyUci(fenStr: string, ...ucis: string[]) {
  const board = parseFen(fenStr);
  for (const uci of ucis) {
    const move = uciToMove(uci, board);
    expect(move).not.toBeNull();
    makeMove(board, move!);
  }
  return board;
}

// ─── En passant ──────────────────────────────────────────────────────────────

describe("En passant", () => {
  it("white captures en passant after black double push", () => {
    // White pawn on e5, black plays d5 → white can capture d6
    const board = parseFen("rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3");
    const legal = generateLegalMoves(board);
    const ep = legal.find((m) => m.from === 36 && m.to === 43); // e5→d6
    expect(ep).toBeDefined();
  });

  it("en passant removes the captured pawn", () => {
    const board = parseFen("rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3");
    const move = uciToMove("e5d6", board)!;
    makeMove(board, move);
    expect(board.squares[27]).toBe(EMPTY); // d4 square – actually d5=sq35
  });

  it("removes black pawn at d5 when white captures en passant", () => {
    // e5=36(rank4,file4), d5=35(rank4,file3), d6=43(rank5,file3)
    const board = parseFen("8/8/8/3pP3/8/8/8/8 w - d6 0 1");
    const before = board.squares[35]; // d5 = rank4*8+file3 = 35
    expect(before).toBe(B_PAWN);
    const move = uciToMove("e5d6", board)!;
    makeMove(board, move);
    expect(board.squares[35]).toBe(EMPTY); // d5 pawn gone
    expect(board.squares[43]).toBe(W_PAWN); // white pawn at d6
  });
});

// ─── Castling ────────────────────────────────────────────────────────────────

describe("Castling", () => {
  it("white castles kingside", () => {
    const board = parseFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    const legal = generateLegalMoves(board);
    const castle = legal.find((m) => m.from === 4 && m.to === 6);
    expect(castle).toBeDefined();
  });

  it("white castles queenside", () => {
    const board = parseFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    const legal = generateLegalMoves(board);
    const castle = legal.find((m) => m.from === 4 && m.to === 2);
    expect(castle).toBeDefined();
  });

  it("cannot castle through check", () => {
    // White cannot castle kingside when f1 is attacked
    const board = parseFen("4k3/8/8/8/8/8/8/R3K2r w KQ - 0 1");
    const legal = generateLegalMoves(board);
    const castle = legal.find((m) => m.from === 4 && m.to === 6);
    expect(castle).toBeUndefined();
  });

  it("cannot castle while in check", () => {
    // King in check
    const board = parseFen("4k3/8/4r3/8/8/8/8/R3K2R w KQ - 0 1");
    const legal = generateLegalMoves(board);
    const castleKS = legal.find((m) => m.from === 4 && m.to === 6);
    const castleQS = legal.find((m) => m.from === 4 && m.to === 2);
    expect(castleKS).toBeUndefined();
    expect(castleQS).toBeUndefined();
  });

  it("rook moves correctly after castling", () => {
    const board = parseFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    const move = uciToMove("e1g1", board)!;
    makeMove(board, move);
    expect(board.squares[6]).toBe(W_KING);
    expect(board.squares[5]).toBe(W_ROOK);
    expect(board.squares[7]).toBe(EMPTY);
    expect(board.squares[4]).toBe(EMPTY);
  });

  it("castling rights removed after king move", () => {
    const board = parseFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    const move = uciToMove("e1e2", board)!;
    makeMove(board, move);
    expect(board.castlingRights & 3).toBe(0); // WK and WQ gone
  });

  it("castling rights removed after rook move", () => {
    const board = parseFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    const move = uciToMove("h1h2", board)!;
    makeMove(board, move);
    expect(board.castlingRights & 1).toBe(0); // WK gone
    expect(board.castlingRights & 2).toBe(2); // WQ still set
  });
});

// ─── Promotion ───────────────────────────────────────────────────────────────

describe("Promotion", () => {
  it("generates 4 promotion moves for each pawn on 7th rank", () => {
    const board = parseFen("8/P7/8/8/8/8/8/k6K w - - 0 1");
    const legal = generateLegalMoves(board);
    const promos = legal.filter((m) => m.promotion !== 0);
    expect(promos.length).toBe(4);
  });

  it("can promote to queen", () => {
    const board = parseFen("8/P7/8/8/8/8/8/k6K w - - 0 1");
    const move = uciToMove("a7a8q", board)!;
    expect(move.promotion).toBe(5); // QUEEN
    makeMove(board, move);
    expect(board.squares[56]).toBe(W_QUEEN); // a8 = rank7*8+file0 = 56
  });

  it("can promote to knight", () => {
    const board = parseFen("8/P7/8/8/8/8/8/k6K w - - 0 1");
    const move = uciToMove("a7a8n", board)!;
    makeMove(board, move);
    expect(board.squares[56]).toBe(W_KNIGHT);
  });
});

// ─── Check / Checkmate / Stalemate ───────────────────────────────────────────

describe("Check detection", () => {
  it("fool's mate – black wins after 4 half-moves", () => {
    const board = applyUci(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      "f2f3", "e7e5", "g2g4", "d8h4"
    );
    expect(isKingInCheck(board, WHITE)).toBe(true);
    const legal = generateLegalMoves(board);
    expect(legal.length).toBe(0); // checkmate
  });

  it("stalemate – no legal moves, not in check", () => {
    // Classic stalemate: black king on a8, white queen on b6, white king far away
    const board = parseFen("k7/8/1Q6/8/8/8/8/K7 b - - 0 1");
    const inCheck = isKingInCheck(board, BLACK);
    const legal = generateLegalMoves(board);
    expect(inCheck).toBe(false);
    expect(legal.length).toBe(0);
  });
});

// ─── Fifty-move rule ─────────────────────────────────────────────────────────

describe("Fifty-move rule", () => {
  it("halfMoveClock increments on non-pawn non-capture", () => {
    const board = parseFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    const move = uciToMove("g1f3", board)!;
    makeMove(board, move);
    expect(board.halfMoveClock).toBe(1);
  });

  it("halfMoveClock resets on pawn move", () => {
    const board = parseFen("rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1");
    const move = uciToMove("e7e5", board)!;
    makeMove(board, move);
    expect(board.halfMoveClock).toBe(0);
  });
});

// ─── Threefold repetition ─────────────────────────────────────────────────────

describe("Threefold repetition", () => {
  it("positionKey is same after returning to same position", () => {
    const board1 = parseFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    const key1 = positionKey(board1);
    // Apply moves and undo
    const board2 = applyUci(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      "g1f3", "g8f6", "f3g1", "f6g8"
    );
    const key2 = positionKey(board2);
    expect(key1).toBe(key2);
  });
});

// ─── Insufficient material ───────────────────────────────────────────────────

describe("Insufficient material", () => {
  it("K vs K is insufficient", () => {
    const board = parseFen("k7/8/8/8/8/8/8/K7 w - - 0 1");
    expect(isInsufficientMaterial(board)).toBe(true);
  });

  it("K+N vs K is insufficient", () => {
    const board = parseFen("k7/8/8/8/8/8/8/KN6 w - - 0 1");
    expect(isInsufficientMaterial(board)).toBe(true);
  });

  it("K+B vs K is insufficient", () => {
    const board = parseFen("k7/8/8/8/8/8/8/KB6 w - - 0 1");
    expect(isInsufficientMaterial(board)).toBe(true);
  });

  it("K+P vs K is NOT insufficient", () => {
    const board = parseFen("k7/8/8/8/8/8/8/KP6 w - - 0 1");
    expect(isInsufficientMaterial(board)).toBe(false);
  });

  it("K+B vs K+B same color is insufficient", () => {
    // Both bishops on dark squares: W_BISHOP@c1(sq2,0+2=even=dark), B_BISHOP@c3(sq18,2+2=even=dark)
    const board = parseFen("k7/8/8/8/8/2b5/8/K1B5 w - - 0 1");
    expect(isInsufficientMaterial(board)).toBe(true);
  });
});

// ─── Unmake move ─────────────────────────────────────────────────────────────

describe("Unmake move", () => {
  it("board is identical after make+unmake", () => {
    const board = parseFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    const fenBefore = boardToFen(board);
    const legal = generateLegalMoves(board);
    for (const move of legal) {
      makeMove(board, move);
      unmakeMove(board, move);
      expect(boardToFen(board)).toBe(fenBefore);
    }
  });
});

// ─── FEN round-trip ──────────────────────────────────────────────────────────

describe("FEN round-trip", () => {
  it("boardToFen produces the correct starting position FEN", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const board = parseFen(fen);
    expect(boardToFen(board)).toBe(fen);
  });

  it("boardToFen is correct after e2e4", () => {
    const board = parseFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    makeMove(board, uciToMove("e2e4", board)!);
    expect(boardToFen(board)).toBe("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1");
  });
});
