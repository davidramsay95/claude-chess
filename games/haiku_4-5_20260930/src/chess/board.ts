import { Piece, Move, Color, Square, GameState, CastlingRights, GamePosition } from './types';

const FEN_START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export class Board {
  private state: GameState;
  private history: string[] = [];
  private positionHistory: Map<string, number> = new Map();

  constructor(fen: string = FEN_START) {
    this.state = this.fenToState(fen);
    this.positionHistory.set(this.getBoardFen(), 1);
  }

  getState(): GameState {
    return { ...this.state };
  }

  getPosition(): GamePosition {
    return {
      state: this.getState(),
      history: [...this.history],
      positionHistory: new Map(this.positionHistory),
    };
  }

  makeMove(move: Move): boolean {
    const legalMoves = this.getLegalMoves();
    const isLegal = legalMoves.some(m => m.from === move.from && m.to === move.to && m.promotion === move.promotion);

    if (!isLegal) return false;

    const uci = this.moveToUci(move);
    const oldState = { ...this.state, board: [...this.state.board] };

    this.executeMove(move);
    this.history.push(uci);

    const boardFen = this.getBoardFen();
    const count = this.positionHistory.get(boardFen) || 0;
    this.positionHistory.set(boardFen, count + 1);

    return true;
  }

  private executeMove(move: Move): void {
    const piece = this.state.board[move.from];
    if (!piece) return;

    this.state.board[move.to] = null;
    this.state.enPassantSquare = null;

    if (piece.toLowerCase() === 'p') {
      this.state.halfmoveClock = 0;
      const direction = piece === 'P' ? -8 : 8;
      const startRank = piece === 'P' ? 6 : 1;
      const from = move.from;
      const fromRank = Math.floor(from / 8);

      if (fromRank === startRank && Math.abs(move.to - move.from) === 16) {
        this.state.enPassantSquare = move.from + direction;
      }

      if (Math.abs(move.to - move.from) === 7 || Math.abs(move.to - move.from) === 9) {
        if (this.state.board[move.to] === null) {
          const captureSquare = move.to + direction;
          this.state.board[captureSquare] = null;
        }
      }

      if ((piece === 'P' && move.to < 8) || (piece === 'p' && move.to > 55)) {
        const promoted = move.promotion || (piece === 'P' ? 'Q' : 'q');
        this.state.board[move.to] = promoted as Piece;
      } else {
        this.state.board[move.to] = piece;
      }
    } else {
      this.state.board[move.to] = piece;
      if (this.state.board[move.to] !== null) {
        this.state.halfmoveClock = 0;
      } else {
        this.state.halfmoveClock++;
      }
    }

    if (piece === 'K') {
      this.state.castlingRights.whiteKingside = false;
      this.state.castlingRights.whiteQueenside = false;
      if (Math.abs(move.to - move.from) === 2) {
        if (move.to === 6) {
          this.state.board[5] = this.state.board[7];
          this.state.board[7] = null;
        } else if (move.to === 2) {
          this.state.board[3] = this.state.board[0];
          this.state.board[0] = null;
        }
      }
    } else if (piece === 'k') {
      this.state.castlingRights.blackKingside = false;
      this.state.castlingRights.blackQueenside = false;
      if (Math.abs(move.to - move.from) === 2) {
        if (move.to === 62) {
          this.state.board[61] = this.state.board[63];
          this.state.board[63] = null;
        } else if (move.to === 58) {
          this.state.board[59] = this.state.board[56];
          this.state.board[56] = null;
        }
      }
    } else if (piece === 'R') {
      if (move.from === 7) this.state.castlingRights.whiteKingside = false;
      if (move.from === 0) this.state.castlingRights.whiteQueenside = false;
    } else if (piece === 'r') {
      if (move.from === 63) this.state.castlingRights.blackKingside = false;
      if (move.from === 56) this.state.castlingRights.blackQueenside = false;
    }

    this.state.board[move.from] = null;
    this.state.turn = this.state.turn === 'white' ? 'black' : 'white';
    if (this.state.turn === 'white') this.state.fullmoveNumber++;
  }

  getLegalMoves(): Move[] {
    const pseudoLegal = this.getPseudoLegalMoves();
    return pseudoLegal.filter(move => !this.isInCheckAfterMove(move));
  }

  private getPseudoLegalMoves(): Move[] {
    const moves: Move[] = [];
    for (let square = 0; square < 64; square++) {
      const piece = this.state.board[square];
      if (!piece || this.isOpponentPiece(piece)) continue;
      moves.push(...this.getMovesForPiece(square, piece));
    }
    return moves;
  }

  private getMovesForPiece(square: Square, piece: Piece): Move[] {
    const moves: Move[] = [];
    if (!piece) return moves;
    const isWhite = piece === piece.toUpperCase();

    switch (piece.toLowerCase()) {
      case 'p':
        moves.push(...this.getPawnMoves(square, isWhite));
        break;
      case 'n':
        moves.push(...this.getKnightMoves(square));
        break;
      case 'b':
        moves.push(...this.getBishopMoves(square));
        break;
      case 'r':
        moves.push(...this.getRookMoves(square));
        break;
      case 'q':
        moves.push(...this.getQueenMoves(square));
        break;
      case 'k':
        moves.push(...this.getKingMoves(square, isWhite));
        break;
    }
    return moves;
  }

  private getPawnMoves(square: Square, isWhite: boolean): Move[] {
    const moves: Move[] = [];
    const direction = isWhite ? -8 : 8;
    const startRank = isWhite ? 6 : 1;
    const promotionRank = isWhite ? 0 : 7;

    const rank = Math.floor(square / 8);
    const file = square % 8;

    const forward = square + direction;
    if (forward >= 0 && forward < 64 && this.state.board[forward] === null) {
      if (Math.floor(forward / 8) === promotionRank) {
        moves.push({ from: square, to: forward, promotion: 'Q' });
        moves.push({ from: square, to: forward, promotion: 'R' });
        moves.push({ from: square, to: forward, promotion: 'B' });
        moves.push({ from: square, to: forward, promotion: 'N' });
      } else {
        moves.push({ from: square, to: forward });
      }
    }

    if (rank === startRank) {
      const twoForward = square + 2 * direction;
      if (this.state.board[forward] === null && this.state.board[twoForward] === null) {
        moves.push({ from: square, to: twoForward });
      }
    }

    [direction - 1, direction + 1].forEach(d => {
      const captureSquare = square + d;
      if (captureSquare >= 0 && captureSquare < 64 && (captureSquare % 8 === (square % 8) - 1 || captureSquare % 8 === (square % 8) + 1)) {
        if (this.state.board[captureSquare] && this.isOpponentPiece(this.state.board[captureSquare])) {
          if (Math.floor(captureSquare / 8) === promotionRank) {
            moves.push({ from: square, to: captureSquare, promotion: 'Q' });
            moves.push({ from: square, to: captureSquare, promotion: 'R' });
            moves.push({ from: square, to: captureSquare, promotion: 'B' });
            moves.push({ from: square, to: captureSquare, promotion: 'N' });
          } else {
            moves.push({ from: square, to: captureSquare });
          }
        } else if (captureSquare === this.state.enPassantSquare) {
          moves.push({ from: square, to: captureSquare });
        }
      }
    });

    return moves;
  }

  private getKnightMoves(square: Square): Move[] {
    const moves: Move[] = [];
    const offsets = [-17, -15, -10, -6, 6, 10, 15, 17];
    const rank = Math.floor(square / 8);
    const file = square % 8;

    offsets.forEach(offset => {
      const to = square + offset;
      if (to >= 0 && to < 64) {
        const toRank = Math.floor(to / 8);
        const toFile = to % 8;
        if (Math.abs(toRank - rank) <= 2 && Math.abs(toFile - file) <= 2) {
          const target = this.state.board[to];
          if (!target || this.isOpponentPiece(target)) {
            moves.push({ from: square, to });
          }
        }
      }
    });
    return moves;
  }

  private getBishopMoves(square: Square): Move[] {
    return this.getSlidingMoves(square, [-9, -7, 7, 9]);
  }

  private getRookMoves(square: Square): Move[] {
    return this.getSlidingMoves(square, [-8, -1, 1, 8]);
  }

  private getQueenMoves(square: Square): Move[] {
    return this.getSlidingMoves(square, [-9, -8, -7, -1, 1, 7, 8, 9]);
  }

  private getSlidingMoves(square: Square, directions: number[]): Move[] {
    const moves: Move[] = [];
    const rank = Math.floor(square / 8);
    const file = square % 8;

    directions.forEach(direction => {
      for (let i = 1; i < 8; i++) {
        const to = square + direction * i;
        if (to < 0 || to >= 64) break;

        const toRank = Math.floor(to / 8);
        const toFile = to % 8;

        const isHorizontal = direction === -1 || direction === 1;
        const isVertical = direction === -8 || direction === 8;
        const isDiagonal = Math.abs(direction) === 7 || Math.abs(direction) === 9;

        if (isHorizontal && toRank !== rank) break;
        if (isVertical && toFile !== file) break;
        if (isDiagonal && Math.abs(toRank - rank) !== i) break;

        const target = this.state.board[to];
        if (!target) {
          moves.push({ from: square, to });
        } else {
          if (this.isOpponentPiece(target)) {
            moves.push({ from: square, to });
          }
          break;
        }
      }
    });
    return moves;
  }

  private getKingMoves(square: Square, isWhite: boolean): Move[] {
    const moves: Move[] = [];
    const rank = Math.floor(square / 8);
    const file = square % 8;

    for (let offset of [-9, -8, -7, -1, 1, 7, 8, 9]) {
      const to = square + offset;
      if (to >= 0 && to < 64) {
        const toRank = Math.floor(to / 8);
        const toFile = to % 8;
        if (Math.abs(toRank - rank) <= 1 && Math.abs(toFile - file) <= 1) {
          const target = this.state.board[to];
          if (!target || this.isOpponentPiece(target)) {
            moves.push({ from: square, to });
          }
        }
      }
    }

    // Castling
    if (isWhite) {
      if (this.state.castlingRights.whiteKingside && this.state.board[5] === null && this.state.board[6] === null) {
        if (!this.isInCheck('white') && !this.isSquareAttacked(5, 'black')) {
          moves.push({ from: square, to: 6 });
        }
      }
      if (this.state.castlingRights.whiteQueenside && this.state.board[1] === null && this.state.board[2] === null && this.state.board[3] === null) {
        if (!this.isInCheck('white') && !this.isSquareAttacked(3, 'black')) {
          moves.push({ from: square, to: 2 });
        }
      }
    } else {
      if (this.state.castlingRights.blackKingside && this.state.board[61] === null && this.state.board[62] === null) {
        if (!this.isInCheck('black') && !this.isSquareAttacked(61, 'white')) {
          moves.push({ from: square, to: 62 });
        }
      }
      if (this.state.castlingRights.blackQueenside && this.state.board[57] === null && this.state.board[58] === null && this.state.board[59] === null) {
        if (!this.isInCheck('black') && !this.isSquareAttacked(59, 'white')) {
          moves.push({ from: square, to: 58 });
        }
      }
    }

    return moves;
  }

  isInCheck(color: Color): boolean {
    const kingPiece = color === 'white' ? 'K' : 'k';
    const kingSquare = this.state.board.indexOf(kingPiece);
    if (kingSquare === -1) return false;
    return this.isSquareAttacked(kingSquare, color === 'white' ? 'black' : 'white');
  }

  private isSquareAttacked(square: Square, byColor: Color): boolean {
    for (let from = 0; from < 64; from++) {
      const piece = this.state.board[from];
      if (!piece) continue;
      const isWhitePiece = piece === piece.toUpperCase();
      if (byColor === 'white' && !isWhitePiece) continue;
      if (byColor === 'black' && isWhitePiece) continue;

      if (this.canPieceAttackSquare(from, square, piece)) return true;
    }
    return false;
  }

  private canPieceAttackSquare(from: Square, to: Square, piece: Piece): boolean {
    if (!piece) return false;
    const isWhite = piece === piece.toUpperCase();

    switch (piece.toLowerCase()) {
      case 'p': {
        const direction = isWhite ? -8 : 8;
        return (to === from + direction - 1 || to === from + direction + 1);
      }
      case 'n': {
        const offsets = [-17, -15, -10, -6, 6, 10, 15, 17];
        return offsets.some(offset => {
          const candidate = from + offset;
          if (candidate < 0 || candidate >= 64) return false;
          const toRank = Math.floor(candidate / 8);
          const toFile = candidate % 8;
          const fromRank = Math.floor(from / 8);
          const fromFile = from % 8;
          return Math.abs(toRank - fromRank) <= 2 && Math.abs(toFile - fromFile) <= 2 && candidate === to;
        });
      }
      case 'b':
        return this.canSlidingPieceAttack(from, to, [-9, -7, 7, 9]);
      case 'r':
        return this.canSlidingPieceAttack(from, to, [-8, -1, 1, 8]);
      case 'q':
        return this.canSlidingPieceAttack(from, to, [-9, -8, -7, -1, 1, 7, 8, 9]);
      case 'k': {
        const rank = Math.floor(from / 8);
        const file = from % 8;
        const toRank = Math.floor(to / 8);
        const toFile = to % 8;
        return Math.abs(toRank - rank) <= 1 && Math.abs(toFile - file) <= 1;
      }
    }
    return false;
  }

  private canSlidingPieceAttack(from: Square, to: Square, directions: number[]): boolean {
    const rank = Math.floor(from / 8);
    const file = from % 8;

    for (const direction of directions) {
      for (let i = 1; i < 8; i++) {
        const candidate = from + direction * i;
        if (candidate < 0 || candidate >= 64) break;

        const toRank = Math.floor(candidate / 8);
        const toFile = candidate % 8;

        const isHorizontal = direction === -1 || direction === 1;
        const isVertical = direction === -8 || direction === 8;
        const isDiagonal = Math.abs(direction) === 7 || Math.abs(direction) === 9;

        if (isHorizontal && toRank !== rank) break;
        if (isVertical && toFile !== file) break;
        if (isDiagonal && Math.abs(toRank - rank) !== i) break;

        if (candidate === to) return true;

        const blockerPiece = this.state.board[candidate];
        if (blockerPiece) break;
      }
    }
    return false;
  }

  private isInCheckAfterMove(move: Move): boolean {
    const oldBoard = [...this.state.board];
    const oldTurn = this.state.turn;
    const oldEnPassant = this.state.enPassantSquare;
    const oldCastling = { ...this.state.castlingRights };

    const piece = this.state.board[move.from];
    this.state.board[move.to] = piece;
    this.state.board[move.from] = null;
    this.state.turn = oldTurn;

    const inCheck = this.isInCheck(oldTurn);

    this.state.board = oldBoard;
    this.state.turn = oldTurn;
    this.state.enPassantSquare = oldEnPassant;
    this.state.castlingRights = oldCastling;

    return inCheck;
  }

  isCheckmate(): boolean {
    return this.isInCheck(this.state.turn) && this.getLegalMoves().length === 0;
  }

  isStalemate(): boolean {
    return !this.isInCheck(this.state.turn) && this.getLegalMoves().length === 0;
  }

  isInsufficientMaterial(): boolean {
    const pieces = this.state.board.filter(p => p);
    const minorPieces = pieces.filter(p => p && ['N', 'B', 'n', 'b'].includes(p));

    if (pieces.length <= 2) return true;
    if (pieces.length === 3 && minorPieces.length === 1) return true;
    if (pieces.every(p => p && ['N', 'B', 'K', 'n', 'b', 'k'].includes(p))) {
      if (pieces.filter(p => p === 'B' || p === 'b').length === 2) {
        const whiteBishop = this.state.board.indexOf('B');
        const blackBishop = this.state.board.indexOf('b');
        if (whiteBishop !== -1 && blackBishop !== -1) {
          const whiteBishopSquare = (whiteBishop % 8) + (Math.floor(whiteBishop / 8) % 2);
          const blackBishopSquare = (blackBishop % 8) + (Math.floor(blackBishop / 8) % 2);
          if ((whiteBishopSquare % 2) === (blackBishopSquare % 2)) return true;
        }
      }
    }
    return false;
  }

  isThreefoldRepetition(): boolean {
    const boardFen = this.getBoardFen();
    return (this.positionHistory.get(boardFen) ?? 0) >= 3;
  }

  isFiftymoveRule(): boolean {
    return this.state.halfmoveClock >= 100;
  }

  private isOpponentPiece(piece: Piece): boolean {
    if (!piece) return false;
    const isWhitePiece = piece === piece.toUpperCase();
    return this.state.turn === 'white' ? !isWhitePiece : isWhitePiece;
  }

  private fenToState(fen: string): GameState {
    const parts = fen.split(' ');
    const board = this.fenToBoard(parts[0]);
    const turn = parts[1] === 'w' ? 'white' : 'black';
    const castlingRights = this.parseCastling(parts[2]);
    const enPassant = parts[3] === '-' ? null : this.algebraicToSquare(parts[3]);
    const halfmove = parseInt(parts[4], 10);
    const fullmove = parseInt(parts[5], 10);

    return { board, turn, castlingRights, enPassantSquare: enPassant, halfmoveClock: halfmove, fullmoveNumber: fullmove };
  }

  private fenToBoard(fen: string): Piece[] {
    const board: Piece[] = Array(64).fill(null);
    const rows = fen.split('/');
    let square = 0;
    rows.forEach(row => {
      for (const char of row) {
        if (/\d/.test(char)) {
          square += parseInt(char, 10);
        } else {
          board[square] = char as Piece;
          square++;
        }
      }
    });
    return board;
  }

  private parseCastling(castling: string): CastlingRights {
    return {
      whiteKingside: castling.includes('K'),
      whiteQueenside: castling.includes('Q'),
      blackKingside: castling.includes('k'),
      blackQueenside: castling.includes('q'),
    };
  }

  private algebraicToSquare(algebraic: string): Square {
    return (algebraic.charCodeAt(0) - 97) + (8 - parseInt(algebraic[1], 10)) * 8;
  }

  private squareToAlgebraic(square: Square): string {
    return String.fromCharCode(97 + (square % 8)) + (8 - Math.floor(square / 8));
  }

  private getBoardFen(): string {
    let fen = '';
    for (let rank = 0; rank < 8; rank++) {
      let empty = 0;
      for (let file = 0; file < 8; file++) {
        const piece = this.state.board[rank * 8 + file];
        if (piece) {
          if (empty > 0) fen += empty;
          fen += piece;
          empty = 0;
        } else {
          empty++;
        }
      }
      if (empty > 0) fen += empty;
      if (rank < 7) fen += '/';
    }
    return fen;
  }

  moveToUci(move: Move): string {
    const from = this.squareToAlgebraic(move.from);
    const to = this.squareToAlgebraic(move.to);
    const promotion = move.promotion ? move.promotion.toLowerCase() : '';
    return from + to + promotion;
  }

  uciToMove(uci: string): Move | null {
    if (uci.length < 4) return null;
    const from = this.algebraicToSquare(uci.substring(0, 2));
    const to = this.algebraicToSquare(uci.substring(2, 4));
    const promotion = uci.length > 4 ? (uci[4].toUpperCase() as any) : undefined;
    return { from, to, promotion };
  }

  toFen(): string {
    const pieceFen = this.getBoardFen();
    const turn = this.state.turn === 'white' ? 'w' : 'b';
    const castling = (this.state.castlingRights.whiteKingside ? 'K' : '') +
                     (this.state.castlingRights.whiteQueenside ? 'Q' : '') +
                     (this.state.castlingRights.blackKingside ? 'k' : '') +
                     (this.state.castlingRights.blackQueenside ? 'q' : '') || '-';
    const enPassant = this.state.enPassantSquare === null ? '-' : this.squareToAlgebraic(this.state.enPassantSquare);
    return `${pieceFen} ${turn} ${castling} ${enPassant} ${this.state.halfmoveClock} ${this.state.fullmoveNumber}`;
  }

  loadFromPosition(position: GamePosition): void {
    this.state = position.state;
    this.history = [...position.history];
    this.positionHistory = new Map(position.positionHistory);
  }

  loadFromFen(fen: string): void {
    this.state = this.fenToState(fen);
    this.history = [];
    this.positionHistory = new Map();
    this.positionHistory.set(this.getBoardFen(), 1);
  }

  getMoveHistory(): string[] {
    return [...this.history];
  }
}
