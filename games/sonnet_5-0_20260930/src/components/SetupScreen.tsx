import type { JSX } from "react";
import { useState } from "react";
import type { Color } from "../engine/index";
import type { Difficulty } from "../ai/index";
import { PieceIcon } from "./PieceIcon";

interface SetupScreenProps {
  defaultColor: Color;
  defaultDifficulty: Difficulty;
  onStart: (color: Color, difficulty: Difficulty) => void;
}

const DIFFICULTIES: { value: Difficulty; label: string; description: string }[] = [
  { value: "easy", label: "Easy", description: "Looks ahead a couple of moves, plays loosely." },
  { value: "medium", label: "Medium", description: "A solid casual opponent." },
  { value: "hard", label: "Hard", description: "Sharper tactics, thinks harder about captures." },
  { value: "expert", label: "Expert", description: "Searches deep — a real challenge." },
];

export function SetupScreen({ defaultColor, defaultDifficulty, onStart }: SetupScreenProps): JSX.Element {
  const [color, setColor] = useState<Color>(defaultColor);
  const [difficulty, setDifficulty] = useState<Difficulty>(defaultDifficulty);

  return (
    <div className="setup">
      <h1 className="setup__title">Chess</h1>
      <p className="setup__subtitle">No game in progress. Choose your side and a difficulty to begin.</p>

      <section className="setup__section">
        <h2 className="setup__heading">Play as</h2>
        <div className="setup__options">
          {(["white", "black"] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={`setup__option${color === option ? " setup__option--active" : ""}`}
              onClick={() => setColor(option)}
              aria-pressed={color === option}
            >
              <span className="setup__option-icon">
                <PieceIcon type="k" color={option} />
              </span>
              <span>{option === "white" ? "White" : "Black"}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="setup__section">
        <h2 className="setup__heading">Difficulty</h2>
        <div className="setup__options setup__options--column">
          {DIFFICULTIES.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`setup__option setup__option--wide${difficulty === option.value ? " setup__option--active" : ""}`}
              onClick={() => setDifficulty(option.value)}
              aria-pressed={difficulty === option.value}
            >
              <span className="setup__option-label">{option.label}</span>
              <span className="setup__option-description">{option.description}</span>
            </button>
          ))}
        </div>
      </section>

      <button type="button" className="setup__start" onClick={() => onStart(color, difficulty)}>
        Start game
      </button>
    </div>
  );
}
