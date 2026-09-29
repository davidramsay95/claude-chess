import { useEffect, useEffectEvent, useState } from "react";
import type { EngineClient } from "@/engine/engineClient";
import type { Difficulty } from "@/engine/protocol";

/** Instant replies at low difficulty feel abrupt, so every reply waits at least this long. */
export const MIN_ENGINE_REPLY_MS = 350;

interface EngineReplyOptions {
  getEngine: () => EngineClient;
  startFen: string;
  moves: readonly string[];
  difficulty: Difficulty;
  /** True when it is the engine's turn in a game that is still in progress. */
  enabled: boolean;
  /** Receives the engine's move; returns an error message when the move cannot be played. */
  onReply: (uci: string) => string | null;
}

export interface EngineReplyState {
  thinking: boolean;
  error: string | null;
  retry: () => void;
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Asks the engine for a move whenever it is the engine's turn, ignoring replies that arrive too late. */
export const useEngineReply = ({
  getEngine,
  startFen,
  moves,
  difficulty,
  enabled,
  onReply,
}: EngineReplyOptions): EngineReplyState => {
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const handleReply = useEffectEvent(onReply);
  const requestMove = useEffectEvent((request: readonly string[]) =>
    getEngine().requestMove({ startFen, moves: request, difficulty }),
  );

  useEffect(() => {
    if (!enabled) return;
    // Cleared when the position changes, the game ends or the view unmounts, so a stale reply is dropped.
    let current = true;
    const run = async (): Promise<void> => {
      try {
        const [move] = await Promise.all([requestMove(moves), delay(MIN_ENGINE_REPLY_MS)]);
        if (current) setError(handleReply(move));
      } catch (failure) {
        if (current) setError(describeError(failure));
      }
    };
    void run();
    return () => {
      current = false;
    };
  }, [enabled, moves, attempt]);

  return {
    thinking: enabled && error === null,
    error: enabled ? error : null,
    retry: () => {
      setError(null);
      setAttempt((count) => count + 1);
    },
  };
};
