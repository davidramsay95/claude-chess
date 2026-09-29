import type { DrawReason, GameStatus } from '../engine/game';
import type { Color } from '../engine/types';

export type GameResult =
  | { kind: 'checkmate'; winner: Color }
  | { kind: 'draw'; reason: DrawReason }
  | { kind: 'resignation'; winner: Color };

export interface ResultDescription {
  title: string;
  detail: string;
  tone: 'win' | 'loss' | 'draw';
}

export const resultFromStatus = (status: GameStatus): GameResult | null => {
  if (status.state === 'checkmate' && status.winner !== undefined) return { kind: 'checkmate', winner: status.winner };
  if (status.state === 'draw' && status.reason) return { kind: 'draw', reason: status.reason };
  return null;
};

const DRAW_TEXT: Record<DrawReason, string> = {
  stalemate: 'Stalemate',
  'threefold-repetition': 'Threefold repetition',
  'fifty-move': 'Fifty-move rule',
  'insufficient-material': 'Insufficient material',
  agreement: 'Draw agreed',
};

export const describeResult = (result: GameResult, playerColor: Color): ResultDescription => {
  if (result.kind === 'draw') return { title: 'Draw', detail: DRAW_TEXT[result.reason], tone: 'draw' };
  const won = result.winner === playerColor;
  return {
    title: won ? 'You win' : 'You lose',
    detail: result.kind === 'checkmate' ? 'Checkmate' : 'You resigned',
    tone: won ? 'win' : 'loss',
  };
};
