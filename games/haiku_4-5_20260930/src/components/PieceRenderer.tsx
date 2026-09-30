import React from 'react';
import { Piece, GameState } from '../chess/types';

interface Props {
  board: GameState;
  selectedSquare: number | null;
}

const PIECE_SVG: { [key: string]: string } = {
  'K': 'M0.5,0.1 L0.8,0.3 L0.9,0.5 L0.8,0.7 L0.5,0.9 L0.2,0.7 L0.1,0.5 L0.2,0.3 Z M0.5,0 L0.7,0.2 L0.7,0.8 L0.3,0.8 L0.3,0.2 Z M0.35,0.35 L0.65,0.35 L0.65,0.65 L0.35,0.65 Z',
  'Q': 'M0.5,0 L0.9,0.4 L0.8,0.8 L0.5,0.95 L0.2,0.8 L0.1,0.4 Z M0.3,0.3 L0.7,0.3 L0.75,0.7 L0.5,0.85 L0.25,0.7 Z M0.45,0.4 L0.55,0.4 L0.55,0.65 L0.45,0.65 Z M0.5,0.15 L0.55,0.25 L0.45,0.25 Z',
  'R': 'M0.2,0.1 L0.8,0.1 L0.8,0.9 L0.2,0.9 Z M0.3,0.15 L0.3,0.2 M0.5,0.15 L0.5,0.2 M0.7,0.15 L0.7,0.2 M0.35,0.4 L0.65,0.4 L0.65,0.8 L0.35,0.8 Z',
  'B': 'M0.5,0.05 L0.7,0.2 L0.75,0.4 L0.7,0.6 L0.5,0.85 L0.3,0.6 L0.25,0.4 L0.3,0.2 Z M0.4,0.3 L0.6,0.3 L0.6,0.65 L0.4,0.65 Z M0.5,0.15 L0.55,0.2 L0.45,0.2 Z',
  'N': 'M0.2,0.8 L0.4,0.2 L0.6,0.3 L0.7,0.5 L0.6,0.7 L0.4,0.8 Z M0.25,0.75 L0.35,0.35 L0.6,0.4 L0.65,0.65 L0.4,0.75 Z',
  'P': 'M0.5,0.2 L0.7,0.5 L0.65,0.8 L0.35,0.8 L0.3,0.5 Z M0.5,0.15 L0.6,0.25 L0.4,0.25 Z M0.35,0.5 L0.65,0.5 L0.6,0.75 L0.4,0.75 Z',
};

export const PieceRenderer: React.FC<Props> = ({ board, selectedSquare }) => {
  return (
    <g className="pieces">
      {board.board.map((piece, square) => {
        if (!piece) return null;

        const row = Math.floor(square / 8);
        const col = square % 8;
        const isWhite = piece === piece.toUpperCase();
        const pieceType = piece.toUpperCase();

        return (
          <g
            key={square}
            className={`piece ${isWhite ? 'white' : 'black'} ${selectedSquare === square ? 'selected' : ''}`}
            transform={`translate(${col + 0.5}, ${row + 0.5})`}
          >
            <circle cx="0" cy="0" r="0.45" className="piece-bg" />
            <text
              x="0"
              y="0.15"
              textAnchor="middle"
              dominantBaseline="central"
              className="piece-text"
              fontSize="0.6"
              fontWeight="bold"
            >
              {getPieceSymbol(pieceType)}
            </text>
          </g>
        );
      })}
    </g>
  );
};

function getPieceSymbol(piece: string): string {
  const symbols: { [key: string]: string } = {
    'K': '♔',
    'Q': '♕',
    'R': '♖',
    'B': '♗',
    'N': '♘',
    'P': '♙',
  };
  return symbols[piece] || '?';
}
