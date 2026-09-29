"use client";

import { useState } from "react";
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

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-4 pt-4 sm:px-6">
        <p className="font-display text-lg text-brass">Club Room Chess</p>
      </header>
      <main className="flex flex-1 items-start justify-center px-3 py-5 sm:px-6 lg:items-center">
        {settings ? (
          <GameView settings={settings} createEngine={createEngine} onNewGame={() => setSettings(null)} />
        ) : (
          <SetupScreen
            onStart={(choice) => setSettings({ humanColor: resolveSide(choice.side), difficulty: choice.difficulty })}
          />
        )}
      </main>
    </div>
  );
};
