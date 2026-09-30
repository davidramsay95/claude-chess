import React, { useState, useEffect, useRef, useCallback } from "react";
import { SetupScreen } from "./components/SetupScreen.js";
import { Board } from "./components/Board.js";
import { MoveList } from "./components/MoveList.js";
import { PromotionDialog } from "./components/PromotionDialog.js";
import {
  parseFen, boardToFen, makeMove, uciToMove, moveToUci,
  generateLegalMoves, isKingInCheck, isInsufficientMaterial, positionKey,
  STARTING_FEN, WHITE, BLACK,
} from "./engine/index.js";
import type { BoardState } from "./engine/index.js";
import { PlayerColor, Difficulty, GameState, SavedGame, GameResult } from "./types.js";
import { setupBridge, replayGame, gameStateToSaved } from "./bridge/messageBridge.js";
import type { ReplayResult } from "./bridge/messageBridge.js";

const STORAGE_KEY = "sonnet_4-6_20260930_game";

function getInitialGameState(): GameState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedGame;
    const result = replayGame(parsed);
    return result.ok ? result.state : null;
  } catch {
    return null;
  }
}

function computeBoard(startFen: string, moves: string[]): BoardState {
  const board = parseFen(startFen);
  for (const uci of moves) {
    const move = uciToMove(uci, board);
    if (move) makeMove(board, move);
  }
  return board;
}

function checkGameEnd(
  board: BoardState,
  fenHistory: string[],
): { result: GameResult; drawReason?: GameState["drawReason"] } | null {
  const legal = generateLegalMoves(board);
  if (legal.length === 0) {
    if (isKingInCheck(board, board.sideToMove)) {
      return { result: board.sideToMove === WHITE ? "0-1" : "1-0" };
    }
    return { result: "1/2-1/2", drawReason: "repetition" }; // stalemate
  }

  if (isInsufficientMaterial(board)) {
    return { result: "1/2-1/2", drawReason: "insufficient" };
  }

  if (board.halfMoveClock >= 100) {
    return { result: "1/2-1/2", drawReason: "fifty-move" };
  }

  // Threefold repetition
  const key = positionKey(board);
  let count = 0;
  for (const f of fenHistory) {
    const b = parseFen(f);
    if (positionKey(b) === key) count++;
  }
  if (count >= 3) {
    return { result: "1/2-1/2", drawReason: "repetition" };
  }

  return null;
}

export function App() {
  const [screen, setScreen] = useState<"setup" | "game">("setup");
  const [gameState, setGameState] = useState<GameState | null>(() => getInitialGameState());
  const [isThinking, setIsThinking] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [importError, setImportError] = useState("");
  const workerRef = useRef<Worker | null>(null);

  // If we have a saved game, go straight to game screen
  useEffect(() => {
    if (gameState) setScreen("game");
  }, []);

  // Set up the message bridge
  useEffect(() => {
    const getState = () => gameState;
    const loadState = (saved: SavedGame): ReplayResult => {
      const result = replayGame(saved);
      if (result.ok) {
        setGameState(result.state);
        setScreen("game");
        setIsThinking(false);
        setStatusMsg("");
      }
      return result;
    };

    const cleanup = setupBridge(getState, loadState);
    return cleanup;
  }, [gameState]);

  // Save to localStorage on change
  useEffect(() => {
    if (!gameState) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(gameStateToSaved(gameState)));
    } catch {
      // ignore
    }
  }, [gameState]);

  // Worker
  const getWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL("./worker/engine.worker.ts", import.meta.url),
        { type: "module" }
      );
    }
    return workerRef.current;
  }, []);

  const triggerEngineMove = useCallback(
    (state: GameState) => {
      const board = computeBoard(state.startFen, state.moves);
      const fen = boardToFen(board);

      setIsThinking(true);
      const worker = getWorker();

      const handler = (e: MessageEvent) => {
        worker.removeEventListener("message", handler);
        worker.removeEventListener("error", errHandler);
        setIsThinking(false);

        const { uci } = e.data as { type: string; uci: string | null };
        if (!uci) return;

        setGameState((prev) => {
          if (!prev) return prev;
          const b = computeBoard(prev.startFen, prev.moves);
          const move = uciToMove(uci, b);
          if (!move) return prev;

          const legal = generateLegalMoves(b);
          const isLegal = legal.some(
            (m) => m.from === move.from && m.to === move.to && m.promotion === move.promotion
          );
          if (!isLegal) return prev;

          makeMove(b, move);
          const newFenHistory = [...prev.fenHistory, boardToFen(b)];
          const newMoves = [...prev.moves, uci];

          const end = checkGameEnd(b, newFenHistory);
          return {
            ...prev,
            moves: newMoves,
            fenHistory: newFenHistory,
            result: end?.result ?? "*",
            drawReason: end?.drawReason,
          };
        });
      };

      const errHandler = () => {
        worker.removeEventListener("message", handler);
        worker.removeEventListener("error", errHandler);
        setIsThinking(false);
      };
      worker.addEventListener("error", errHandler);
      worker.addEventListener("message", handler);
      worker.postMessage({
        type: "getBestMove",
        fen,
        previousFens: state.fenHistory,
        difficulty: state.difficulty,
      });
    },
    [getWorker]
  );

  // Engine auto-moves when it's the engine's turn
  const prevMovesLen = useRef(0);
  useEffect(() => {
    if (!gameState || screen !== "game") return;
    if (gameState.result !== "*") return;
    if (isThinking) return;

    const board = computeBoard(gameState.startFen, gameState.moves);
    const engineSide = gameState.playerColor === "white" ? BLACK : WHITE;
    if (board.sideToMove !== engineSide) return;
    if (gameState.moves.length === prevMovesLen.current) return;

    prevMovesLen.current = gameState.moves.length;
    triggerEngineMove(gameState);
  }, [gameState, screen, isThinking, triggerEngineMove]);

  // Update status message
  useEffect(() => {
    if (!gameState) return;
    if (gameState.result !== "*") {
      if (gameState.resigned) {
        setStatusMsg("You resigned.");
      } else if (gameState.result === "1/2-1/2") {
        const reason = gameState.drawReason;
        setStatusMsg(
          reason === "repetition" ? "Draw by repetition." :
          reason === "fifty-move" ? "Draw by fifty-move rule." :
          reason === "insufficient" ? "Draw — insufficient material." :
          "Draw — stalemate."
        );
      } else {
        const board = computeBoard(gameState.startFen, gameState.moves);
        const loserSide = board.sideToMove;
        const loserColor = loserSide === WHITE ? "white" : "black";
        if (loserColor === gameState.playerColor) {
          setStatusMsg("Checkmate — you lost.");
        } else {
          setStatusMsg("Checkmate — you won!");
        }
      }
    } else if (isThinking) {
      setStatusMsg("Engine is thinking…");
    } else {
      const board = computeBoard(gameState.startFen, gameState.moves);
      const side = board.sideToMove;
      const sideColor = side === WHITE ? "white" : "black";
      if (sideColor === gameState.playerColor) {
        const inCheck = isKingInCheck(board, side);
        setStatusMsg(inCheck ? "You are in check!" : "Your turn.");
      } else {
        setStatusMsg("");
      }
    }
  }, [gameState, isThinking]);

  const handleStart = useCallback(
    (color: PlayerColor, difficulty: Difficulty) => {
      const startFen = STARTING_FEN;
      const board = parseFen(startFen);
      const state: GameState = {
        playerColor: color,
        difficulty,
        startFen,
        moves: [],
        fenHistory: [boardToFen(board)],
        resigned: false,
        result: "*",
      };
      prevMovesLen.current = -1; // force engine move check
      setGameState(state);
      setScreen("game");
      setIsThinking(false);
      setStatusMsg("");
      setImportError("");

      // If player is black, engine (white) moves first
      if (color === "black") {
        prevMovesLen.current = 0;
        setTimeout(() => triggerEngineMove(state), 100);
      }
    },
    [triggerEngineMove]
  );

  const handlePlayerMove = useCallback(
    (from: number, to: number, promotion?: number) => {
      if (!gameState || gameState.result !== "*") return;

      const board = computeBoard(gameState.startFen, gameState.moves);
      const legal = generateLegalMoves(board);
      const move = legal.find(
        (m) =>
          m.from === from &&
          m.to === to &&
          (promotion ? m.promotion === promotion : true) &&
          (!promotion ? m.promotion === 0 || m.promotion === 5 : true)
      );

      if (!move) return;

      // If there's a promotion and we didn't specify one, use queen
      const finalPromotion = move.promotion || promotion || 0;
      const finalMove = { ...move, promotion: finalPromotion };

      const uci = moveToUci(finalMove);
      makeMove(board, finalMove);
      const newFenHistory = [...gameState.fenHistory, boardToFen(board)];
      const newMoves = [...gameState.moves, uci];

      const end = checkGameEnd(board, newFenHistory);
      const newState: GameState = {
        ...gameState,
        moves: newMoves,
        fenHistory: newFenHistory,
        result: end?.result ?? "*",
        drawReason: end?.drawReason,
      };

      setGameState(newState);
    },
    [gameState]
  );

  const handlePromotionNeeded = useCallback(
    (from: number, to: number) => {
      if (!gameState) return;
      setGameState((prev) => (prev ? { ...prev, promotionPending: { from, to } } : prev));
    },
    [gameState]
  );

  const handlePromotionSelect = useCallback(
    (pieceType: number) => {
      if (!gameState?.promotionPending) return;
      const { from, to } = gameState.promotionPending;
      setGameState((prev) => (prev ? { ...prev, promotionPending: undefined } : prev));
      handlePlayerMove(from, to, pieceType);
    },
    [gameState, handlePlayerMove]
  );

  const handlePromotionCancel = useCallback(() => {
    setGameState((prev) => (prev ? { ...prev, promotionPending: undefined } : prev));
  }, []);

  const handleResign = useCallback(() => {
    if (!gameState || gameState.result !== "*") return;
    const result: GameResult = gameState.playerColor === "white" ? "0-1" : "1-0";
    setGameState((prev) => (prev ? { ...prev, resigned: true, result } : prev));
  }, [gameState]);

  const handleNewGame = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    setGameState(null);
    setScreen("setup");
    setIsThinking(false);
    setStatusMsg("");
    setImportError("");
    prevMovesLen.current = 0;
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  const handleExport = useCallback(() => {
    if (!gameState) return;
    const saved = gameStateToSaved(gameState);
    const json = JSON.stringify(saved, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "chess-game.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [gameState]);

  const handleImport = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const saved = JSON.parse(text) as SavedGame;
          const result = replayGame(saved);
          if (result.ok) {
            prevMovesLen.current = -1;
            setGameState(result.state);
            setScreen("game");
            setImportError("");
          } else {
            setImportError(result.error);
          }
        } catch {
          setImportError("Invalid JSON file");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, []);

  if (screen === "setup") {
    return (
      <div className="app">
        <SetupScreen onStart={handleStart} />
        <div className="setup-footer">
          <button className="link-btn" onClick={handleImport}>Import game</button>
          {importError && <p className="error-msg">{importError}</p>}
        </div>
      </div>
    );
  }

  if (!gameState) return null;

  const board = computeBoard(gameState.startFen, gameState.moves);
  const lastMoveUci = gameState.moves[gameState.moves.length - 1];
  const lastMove = lastMoveUci
    ? {
        from: parseInt(lastMoveUci.substring(0, 2).split("").map((c, i) =>
          i === 0 ? c.charCodeAt(0) - 97 : (parseInt(c) - 1) * 8
        ).reduce((a, b) => a + b, "").toString()) || (() => {
          const f = lastMoveUci.charCodeAt(0) - 97;
          const r = parseInt(lastMoveUci[1]) - 1;
          return r * 8 + f;
        })(),
        to: (() => {
          const f = lastMoveUci.charCodeAt(2) - 97;
          const r = parseInt(lastMoveUci[3]) - 1;
          return r * 8 + f;
        })(),
      }
    : null;

  // Fix last move parsing
  const lastMoveData = lastMoveUci ? parseLastMove(lastMoveUci) : null;

  const playerSide = gameState.playerColor === "white" ? WHITE : BLACK;
  const isPlayerTurn = board.sideToMove === playerSide && gameState.result === "*" && !isThinking;

  return (
    <div className="app game-layout">
      <div className="game-header">
        <span className="game-info">
          Playing as {gameState.playerColor} · {gameState.difficulty}
        </span>
        {statusMsg && <span className={`status-msg ${gameState.result !== "*" ? "result" : ""}`}>{statusMsg}</span>}
      </div>

      <div className="game-main">
        <div className="board-container">
          <Board
            board={board}
            playerColor={gameState.playerColor}
            isPlayerTurn={isPlayerTurn}
            lastMove={lastMoveData}
            onMove={handlePlayerMove}
            onPromotionNeeded={handlePromotionNeeded}
          />
          {isThinking && <div className="thinking-overlay">Thinking…</div>}
        </div>

        <div className="game-sidebar">
          <MoveList moves={gameState.moves} startFen={gameState.startFen} />
          <div className="game-actions">
            {gameState.result === "*" && (
              <button className="action-btn danger" onClick={handleResign}>Resign</button>
            )}
            <button className="action-btn" onClick={handleExport} disabled={gameState.moves.length === 0}>Export</button>
            <button className="action-btn" onClick={handleImport}>Import</button>
            <button className="action-btn" onClick={handleNewGame}>New game</button>
          </div>
          {importError && <p className="error-msg">{importError}</p>}
        </div>
      </div>

      {gameState.promotionPending && (
        <PromotionDialog
          playerColor={gameState.playerColor}
          onSelect={handlePromotionSelect}
          onCancel={handlePromotionCancel}
        />
      )}
    </div>
  );
}

function parseLastMove(uci: string): { from: number; to: number } | null {
  if (uci.length < 4) return null;
  const fromFile = uci.charCodeAt(0) - 97;
  const fromRank = parseInt(uci[1]) - 1;
  const toFile = uci.charCodeAt(2) - 97;
  const toRank = parseInt(uci[3]) - 1;
  return {
    from: fromRank * 8 + fromFile,
    to: toRank * 8 + toFile,
  };
}
