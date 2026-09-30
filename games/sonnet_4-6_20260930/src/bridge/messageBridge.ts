import { SavedGame, GameResult, GameState } from "../types.js";
import {
  parseFen, boardToFen, makeMove, uciToMove, generateLegalMoves,
  isKingInCheck, isInsufficientMaterial, positionKey,
  STARTING_FEN, WHITE, BLACK,
} from "../engine/index.js";

// ─── State validation & replay ───────────────────────────────────────────────

const DIFFICULTIES = new Set(["easy", "medium", "hard", "expert"]);
const COLORS = new Set(["white", "black"]);

export type ReplayResult =
  | { ok: true; state: GameState; error?: undefined }
  | { ok: false; error: string; state?: undefined };

export function replayGame(saved: SavedGame): ReplayResult {
  if (saved.version !== 1) return { ok: false, error: "Unsupported version" };
  if (!COLORS.has(saved.playerColor)) return { ok: false, error: "Invalid playerColor" };
  if (!DIFFICULTIES.has(saved.difficulty)) return { ok: false, error: "Invalid difficulty" };
  if (!Array.isArray(saved.moves)) return { ok: false, error: "moves must be an array" };

  const startFen = saved.startFen || STARTING_FEN;

  let board = parseFen(startFen);
  const fenHistory: string[] = [boardToFen(board)];

  for (let i = 0; i < saved.moves.length; i++) {
    const uci = saved.moves[i];
    if (typeof uci !== "string") return { ok: false, error: `Move ${i + 1} is not a string` };

    const move = uciToMove(uci, board);
    if (!move) return { ok: false, error: `Move ${i + 1} (${uci}) could not be parsed` };

    const legal = generateLegalMoves(board);
    const isLegal = legal.some(
      (m) =>
        m.from === move.from &&
        m.to === move.to &&
        m.promotion === move.promotion
    );

    if (!isLegal) return { ok: false, error: `Move ${i + 1} (${uci}) is not legal` };

    makeMove(board, move);
    fenHistory.push(boardToFen(board));
  }

  // Determine result
  let result: GameResult = "*";
  let drawReason: GameState["drawReason"] | undefined;

  if (saved.resigned) {
    result = saved.playerColor === "white" ? "0-1" : "1-0";
  } else if (saved.moves.length > 0) {
    const legalNow = generateLegalMoves(board);
    if (legalNow.length === 0) {
      if (isKingInCheck(board, board.sideToMove)) {
        result = board.sideToMove === WHITE ? "0-1" : "1-0";
      } else {
        result = "1/2-1/2";
        drawReason = "repetition"; // stalemate
      }
    } else if (isInsufficientMaterial(board)) {
      result = "1/2-1/2";
      drawReason = "insufficient";
    } else if (board.halfMoveClock >= 100) {
      result = "1/2-1/2";
      drawReason = "fifty-move";
    } else {
      // Check repetition
      const posKey = positionKey(board);
      const count = fenHistory.filter((f) => {
        const b = parseFen(f);
        return positionKey(b) === posKey;
      }).length;
      if (count >= 3) {
        result = "1/2-1/2";
        drawReason = "repetition";
      }
    }
  }

  const state: GameState = {
    playerColor: saved.playerColor,
    difficulty: saved.difficulty,
    startFen,
    moves: [...saved.moves],
    fenHistory,
    resigned: saved.resigned,
    result,
    drawReason,
  };

  return { ok: true, state };
}

export function gameStateToSaved(state: GameState): SavedGame {
  return {
    version: 1,
    startFen: state.startFen,
    playerColor: state.playerColor,
    difficulty: state.difficulty,
    moves: [...state.moves],
    resigned: state.resigned,
  };
}

export function getGameResult(state: GameState): GameResult {
  return state.result;
}

// ─── Message bridge ───────────────────────────────────────────────────────────

type BridgeMessageType = "ping" | "request-state" | "load-state";

interface ShellMessage {
  source: "claude-chess-shell";
  type: BridgeMessageType;
  requestId?: string;
  state?: SavedGame;
}

export function setupBridge(
  getState: () => GameState | null,
  loadState: (saved: SavedGame) => ReplayResult
): () => void {
  function sendToShell(msg: object): void {
    window.parent.postMessage(msg, window.location.origin);
  }

  function handleMessage(event: MessageEvent): void {
    if (event.origin !== window.location.origin) return;
    if (event.source !== window.parent) return;

    const msg = event.data as ShellMessage;
    if (!msg || typeof msg !== "object") return;
    if (msg.source !== "claude-chess-shell") return;

    switch (msg.type) {
      case "ping":
        sendToShell({ source: "claude-chess-game", type: "ready" });
        break;

      case "request-state": {
        const gs = getState();
        if (!gs) {
          sendToShell({ source: "claude-chess-game", type: "state", requestId: msg.requestId, state: null, summary: null });
        } else {
          const saved = gameStateToSaved(gs);
          const result = gs.result;
          const summary = { result, moveCount: gs.moves.length };
          sendToShell({ source: "claude-chess-game", type: "state", requestId: msg.requestId, state: saved, summary });
        }
        break;
      }

      case "load-state": {
        if (!msg.state) {
          sendToShell({ source: "claude-chess-game", type: "loaded", requestId: msg.requestId, ok: false, error: "No state provided" });
          return;
        }
        const result = loadState(msg.state);
        if (result.ok) {
          sendToShell({ source: "claude-chess-game", type: "loaded", requestId: msg.requestId, ok: true });
        } else {
          sendToShell({ source: "claude-chess-game", type: "loaded", requestId: msg.requestId, ok: false, error: result.error });
        }
        break;
      }
    }
  }

  window.addEventListener("message", handleMessage);

  // Send ready on init
  sendToShell({ source: "claude-chess-game", type: "ready" });

  return () => window.removeEventListener("message", handleMessage);
}
