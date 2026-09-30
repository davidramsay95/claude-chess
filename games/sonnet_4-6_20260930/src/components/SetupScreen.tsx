import React from "react";
import { PlayerColor, Difficulty } from "../types.js";

interface SetupScreenProps {
  onStart: (color: PlayerColor, difficulty: Difficulty) => void;
}

export function SetupScreen({ onStart }: SetupScreenProps) {
  const [color, setColor] = React.useState<PlayerColor>("white");
  const [difficulty, setDifficulty] = React.useState<Difficulty>("medium");

  return (
    <div className="setup-screen">
      <div className="setup-card">
        <h1 className="setup-title">Chess</h1>
        <p className="setup-subtitle">by Claude Sonnet 4.6</p>

        <div className="setup-section">
          <label className="setup-label">Play as</label>
          <div className="color-picker">
            <button
              className={`color-btn ${color === "white" ? "active" : ""}`}
              onClick={() => setColor("white")}
            >
              <span className="color-piece white-piece">♔</span>
              White
            </button>
            <button
              className={`color-btn ${color === "black" ? "active" : ""}`}
              onClick={() => setColor("black")}
            >
              <span className="color-piece black-piece">♚</span>
              Black
            </button>
          </div>
        </div>

        <div className="setup-section">
          <label className="setup-label">Difficulty</label>
          <div className="difficulty-picker">
            {(["easy", "medium", "hard", "expert"] as Difficulty[]).map((d) => (
              <button
                key={d}
                className={`diff-btn ${difficulty === d ? "active" : ""}`}
                onClick={() => setDifficulty(d)}
              >
                {d.charAt(0).toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>
          <p className="difficulty-desc">{difficultyDesc(difficulty)}</p>
        </div>

        <button className="start-btn" onClick={() => onStart(color, difficulty)}>
          Start Game
        </button>
      </div>
    </div>
  );
}

function difficultyDesc(d: Difficulty): string {
  switch (d) {
    case "easy":   return "Plays randomly, makes mistakes";
    case "medium": return "Solid play, finds basic tactics";
    case "hard":   return "Strong play with deep calculation";
    case "expert": return "Maximum strength, full search";
  }
}
