"use client";

import { useCallback, useRef, useState } from "react";
import { useSaveBridge } from "@/bridge/useSaveBridge";
import { parseSavedGame, type SavedGame } from "@/bridge/savedGame";
import type { Side } from "@/chess/game";
import { createEngineClient, type EngineClient } from "@/engine/engineClient";
import { type GameSettings, GameView } from "./GameView";
import { type SetupChoice, SetupScreen } from "./SetupScreen";

interface ChessAppProps {
  /** Injectable so tests can script the engine; defaults to the Web Worker engine. */
  createEngine?: () => EngineClient;
}

const resolveSide = (choice: SetupChoice["side"]): Side => {
  if (choice !== "random") return choice;
  return Math.random() < 0.5 ? "w" : "b";
};

/** The whole app: the setup screen until a game starts, then the game itself. */
export const ChessApp = ({ createEngine = createEngineClient }: ChessAppProps): React.JSX.Element => {
  const [settings, setSettings] = useState<GameSettings | null>(null);
  const [resumed, setResumed] = useState<SavedGame | undefined>(undefined);
  const [gameKey, setGameKey] = useState(0);
  // A ref, not state: the bridge listener must read the latest game without re-rendering or re-registering.
  const progress = useRef<SavedGame | null>(null);

  const trackProgress = useCallback((saved: SavedGame): void => {
    progress.current = saved;
  }, []);
  const getState = useCallback((): SavedGame | null => progress.current, []);
  const loadState = useCallback((state: unknown): void => {
    const saved = parseSavedGame(state);
    progress.current = saved;
    setSettings({ humanColor: saved.humanColor, difficulty: saved.difficulty });
    setResumed(saved);
    // Remounting resets every piece of per-game UI state, whether or not a game was already open.
    setGameKey((key) => key + 1);
  }, []);
  useSaveBridge(getState, loadState);

  const endGame = (): void => {
    progress.current = null;
    setResumed(undefined);
    setSettings(null);
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-4 pt-4 sm:px-6">
        <p className="font-display text-lg text-brass">Club Room Chess</p>
      </header>
      <main className="flex flex-1 items-start justify-center px-3 py-5 sm:px-6 lg:items-center">
        {settings ? (
          <GameView
            key={gameKey}
            settings={settings}
            initial={resumed}
            createEngine={createEngine}
            onNewGame={endGame}
            onProgress={trackProgress}
          />
        ) : (
          <SetupScreen
            onStart={(choice) => setSettings({ humanColor: resolveSide(choice.side), difficulty: choice.difficulty })}
          />
        )}
      </main>
    </div>
  );
};
