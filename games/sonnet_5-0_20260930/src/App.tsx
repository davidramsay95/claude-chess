import type { JSX } from "react";
import { useEffect, useState } from "react";
import { getStatus, isInCheck, makeMove, moveToUci, toFen, uciToMove } from "./engine/index";
import type { Color, Move } from "./engine/index";
import { Board, needsPromotionChoice } from "./components/Board";
import { SetupScreen } from "./components/SetupScreen";
import { MoveList } from "./components/MoveList";
import { PromotionDialog } from "./components/PromotionDialog";
import { GameStatusBanner } from "./components/GameStatusBanner";
import { ImportExportPanel } from "./components/ImportExportPanel";
import { useEngineWorker } from "./hooks/useEngineWorker";
import { useSaveBridge } from "./hooks/useSaveBridge";
import { createNewGameRecord, type GameRecord } from "./lib/gameRecord";
import { loadPreferences, savePreferences } from "./lib/preferences";
import { playSound } from "./lib/sound";

interface PendingPromotion {
  from: string;
  to: string;
}

function lastMoveSquares(record: GameRecord): { from: string; to: string } | null {
  if (record.moves.length === 0) return null;
  const uci = record.moves[record.moves.length - 1].uci;
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

export function App(): JSX.Element {
  const [record, setRecord] = useState<GameRecord | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const [thinking, setThinking] = useState(false);
  const [preferences] = useState(() => loadPreferences());

  const { requestMove } = useEngineWorker();

  const handleImport = (imported: GameRecord): void => {
    setPendingPromotion(null);
    setRecord(imported);
  };

  useSaveBridge(record, handleImport);

  function commitMove(currentRecord: GameRecord, move: Move): void {
    const result = makeMove(currentRecord.state, move);
    if (!result) return;
    const uci = moveToUci(move);
    const nextRecord: GameRecord = {
      ...currentRecord,
      state: result.state,
      moves: [...currentRecord.moves, { uci, san: result.san ?? uci }],
    };
    setRecord(nextRecord);

    if (result.isCapture) {
      playSound("capture");
    } else {
      playSound("move");
    }
    if (getStatus(result.state) === "active" && isInCheck(result.state, result.state.turn)) {
      playSound("check");
    }
  }

  // Drive the AI's turn: whenever it becomes the AI's move, ask the worker
  // for a move and apply it once it replies.
  useEffect(() => {
    if (!record || record.resigned) return;
    if (getStatus(record.state) !== "active") return;

    const aiColor: Color = record.playerColor === "white" ? "black" : "white";
    if (record.state.turn !== aiColor) return;

    let cancelled = false;
    setThinking(true);

    requestMove(toFen(record.state), record.difficulty)
      .then((uci) => {
        if (cancelled) return;
        const move = uciToMove(record.state, uci);
        if (!move) {
          console.error(`AI returned an unparseable move: ${uci}`);
          return;
        }
        commitMove(record, move);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error("AI move failed:", error);
      })
      .finally(() => {
        if (!cancelled) setThinking(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record, requestMove]);

  function handleStart(color: Color, difficulty: GameRecord["difficulty"]): void {
    savePreferences({ color, difficulty });
    setRecord(createNewGameRecord(color, difficulty));
  }

  function handlePlayerMove(move: Move): void {
    if (!record) return;
    if (needsPromotionChoice(record.state, move.from, move.to)) {
      setPendingPromotion({ from: move.from, to: move.to });
      return;
    }
    commitMove(record, move);
  }

  function handlePromotionChoice(piece: "q" | "r" | "b" | "n"): void {
    if (!record || !pendingPromotion) return;
    commitMove(record, { from: pendingPromotion.from, to: pendingPromotion.to, promotion: piece });
    setPendingPromotion(null);
  }

  function handleResign(): void {
    if (!record) return;
    setRecord({ ...record, resigned: true });
  }

  function handleNewGame(): void {
    setRecord(null);
    setPendingPromotion(null);
  }

  const status = record ? getStatus(record.state) : "active";
  const gameOver = record ? record.resigned || status !== "active" : false;
  const aiColor: Color | null = record ? (record.playerColor === "white" ? "black" : "white") : null;
  const isAiTurn = record !== null && !gameOver && record.state.turn === aiColor;
  const boardDisabled = !record || gameOver || isAiTurn || pendingPromotion !== null;

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">Chess</h1>
      </header>

      <main className="app__main">
        {!record ? (
          <SetupScreen
            defaultColor={preferences.color}
            defaultDifficulty={preferences.difficulty}
            onStart={handleStart}
          />
        ) : (
          <div className="game-layout">
            <div className="game-layout__board-area">
              <GameStatusBanner record={record} />
              {thinking && (
                <p className="thinking-indicator" role="status">
                  The AI is thinking…
                </p>
              )}
              <div className="game-layout__board-wrapper">
                <Board
                  state={record.state}
                  orientation={record.playerColor}
                  lastMove={lastMoveSquares(record)}
                  disabled={boardDisabled}
                  onMove={handlePlayerMove}
                />
                {pendingPromotion && (
                  <PromotionDialog
                    color={record.state.turn}
                    onChoose={handlePromotionChoice}
                    onCancel={() => setPendingPromotion(null)}
                  />
                )}
              </div>
              <div className="game-layout__controls">
                <button type="button" onClick={handleResign} disabled={gameOver}>
                  Resign
                </button>
                <button type="button" onClick={handleNewGame}>
                  New game
                </button>
              </div>
            </div>
            <aside className="game-layout__sidebar">
              <MoveList moves={record.moves} />
              <ImportExportPanel record={record} onImport={handleImport} />
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
