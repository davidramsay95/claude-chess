import { useMemo, useState } from "react";
import { ChessGame, type PromotionSymbol, type Side } from "@/chess/game";
import type { EngineClient } from "@/engine/engineClient";
import type { Difficulty } from "@/engine/protocol";
import { materialBalance } from "@/ui/material";
import { outcomeMessage, outcomeScore } from "@/ui/outcome";
import { Board, type MoveSquares } from "./Board";
import { BoardFrame } from "./BoardFrame";
import type { TargetKind } from "./BoardSquare";
import { DIFFICULTY_INFO } from "./difficulties";
import { GameOverBanner } from "./GameOverBanner";
import { PromotionPicker } from "./PromotionPicker";
import { SidePanel } from "./SidePanel";
import { useEngine } from "./useEngine";
import { useEngineReply } from "./useEngineReply";

export interface GameSettings {
  humanColor: Side;
  difficulty: Difficulty;
}

interface GameViewProps {
  settings: GameSettings;
  createEngine: () => EngineClient;
  onNewGame: () => void;
}

/** Rebuilds the game from its move list, which is the single source of truth for React state. */
const replay = (moves: readonly string[]): ChessGame => {
  const game = new ChessGame();
  for (const uci of moves) game.play(uci);
  return game;
};

const isLegal = (game: ChessGame, uci: string): boolean =>
  game.legalMovesFrom(uci.slice(0, 2)).some((move) => move.uci === uci);

const resultDetail = (score: string | null, plies: number): string => {
  const moveCount = Math.ceil(plies / 2);
  return `${score} after ${moveCount} ${moveCount === 1 ? "move" : "moves"}`;
};

const legalTargets = (game: ChessGame, square: string | null): Map<string, TargetKind> =>
  new Map(square ? game.legalMovesFrom(square).map((move) => [move.to, move.isCapture ? "capture" : "move"]) : []);

const statusText = (outcome: string | null, humansTurn: boolean, inCheck: boolean, engineFailed: boolean): string => {
  if (outcome) return outcome;
  if (!humansTurn) return engineFailed ? "The engine stopped" : "Engine is thinking";
  return inCheck ? "You are in check" : "Your move";
};

/** One game against the engine: board, side panel and the flow of turns between human and engine. */
export const GameView = ({ settings, createEngine, onNewGame }: GameViewProps): React.JSX.Element => {
  const { humanColor, difficulty } = settings;
  const [moves, setMoves] = useState<readonly string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [promotion, setPromotion] = useState<MoveSquares | null>(null);
  const [orientation, setOrientation] = useState<Side>(humanColor);
  const [resigned, setResigned] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const getEngine = useEngine(createEngine);

  const game = useMemo(() => replay(moves), [moves]);
  const pieces = useMemo(() => game.pieces(), [game]);
  const result = game.result();
  const outcome = outcomeMessage(result, humanColor, resigned);
  const humansTurn = game.turn() === humanColor;
  const canMove = outcome === null && humansTurn && promotion === null;

  const playMove = (uci: string): void => {
    setMoves([...moves, uci]);
    setSelected(null);
    setPromotion(null);
  };

  const engine = useEngineReply({
    getEngine,
    startFen: game.startFen,
    moves,
    difficulty,
    enabled: outcome === null && !humansTurn,
    onReply: (uci) => {
      if (!isLegal(game, uci)) return `it chose an illegal move (${uci})`;
      setMoves([...moves, uci]);
      return null;
    },
  });

  const ownsPiece = (square: string): boolean =>
    canMove && pieces.some((piece) => piece.square === square && piece.color === humanColor);

  /** Plays a human move, or opens the promotion picker. Returns false when the move is not legal. */
  const attemptMove = (from: string, to: string): boolean => {
    const candidates = game.legalMovesFrom(from).filter((move) => move.to === to);
    if (!canMove || candidates.length === 0) return false;
    if (candidates.length > 1) {
      setPromotion({ from, to });
      setSelected(null);
    } else {
      playMove(candidates[0].uci);
    }
    return true;
  };

  const handleSquareClick = (square: string): void => {
    if (selected && attemptMove(selected, square)) return;
    setSelected(ownsPiece(square) && square !== selected ? square : null);
  };

  const lastMove = game.history().at(-1);
  const sans = game.history().map((move) => move.san);

  return (
    <div className="flex w-full flex-col items-center gap-5 lg:h-[min(calc(100dvh-8rem),52rem,calc(100vw-26rem))] lg:flex-row lg:items-stretch lg:justify-center">
      <BoardFrame className="w-full max-w-[min(100%,calc(100dvh-9rem))] shrink-0 lg:aspect-square lg:h-full lg:w-auto lg:max-w-none">
        <Board
          pieces={pieces}
          orientation={orientation}
          selected={selected}
          targets={legalTargets(game, selected)}
          lastMove={lastMove}
          checkedSquare={game.checkedKingSquare()}
          canDrag={ownsPiece}
          onSquareClick={handleSquareClick}
          onDragStart={setSelected}
          onDrop={(from, to) => {
            attemptMove(from, to);
          }}
        >
          {promotion && (
            <PromotionPicker
              color={humanColor}
              onChoose={(piece: PromotionSymbol) => playMove(`${promotion.from}${promotion.to}${piece}`)}
              onCancel={() => setPromotion(null)}
            />
          )}
          {outcome && !reviewing && (
            <GameOverBanner
              message={outcome}
              detail={resultDetail(outcomeScore(result, humanColor, resigned), moves.length)}
              onNewGame={onNewGame}
              onReview={() => setReviewing(true)}
            />
          )}
        </Board>
      </BoardFrame>
      <SidePanel
        humanColor={humanColor}
        difficultyName={DIFFICULTY_INFO[difficulty].name}
        status={statusText(outcome, humansTurn, game.inCheck(), engine.error !== null)}
        inCheck={outcome === null && game.inCheck()}
        thinking={engine.thinking}
        engineError={engine.error}
        sans={sans}
        balance={materialBalance(pieces, game.history())}
        gameOver={outcome !== null}
        onRetry={engine.retry}
        onNewGame={onNewGame}
        onFlip={() => setOrientation(orientation === "w" ? "b" : "w")}
        onResign={() => setResigned(true)}
      />
    </div>
  );
};
