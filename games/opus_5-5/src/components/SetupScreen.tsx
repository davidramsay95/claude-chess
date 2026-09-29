import type { FormEvent } from "react";
import { DIFFICULTIES, type Difficulty } from "@/engine/protocol";
import { PRIMARY_BUTTON } from "./buttonStyles";
import { DIFFICULTY_INFO } from "./difficulties";
import { PieceGlyph } from "./PieceGlyph";
import { SetupOption } from "./SetupOption";
import { StartingPosition } from "./StartingPosition";

export type SideChoice = "w" | "b" | "random";

export interface SetupChoice {
  side: SideChoice;
  difficulty: Difficulty;
}

interface SetupScreenProps {
  onStart: (choice: SetupChoice) => void;
}

const SIDE_CHOICES: readonly SideChoice[] = ["w", "b", "random"];
const SIDE_NAMES: Record<SideChoice, string> = { w: "White", b: "Black", random: "Random" };

const SideIcon = ({ side }: { side: SideChoice }): React.JSX.Element => {
  if (side === "random") {
    return (
      <span className="relative block size-14">
        <PieceGlyph color="w" type="k" className="absolute top-0 left-0 size-10" />
        <PieceGlyph color="b" type="k" className="absolute right-0 bottom-0 size-10" />
      </span>
    );
  }
  return <PieceGlyph color={side} type="k" className="size-14" />;
};

const parseSide = (value: FormDataEntryValue | null): SideChoice => SIDE_CHOICES.find((side) => side === value) ?? "w";
const parseDifficulty = (value: FormDataEntryValue | null): Difficulty =>
  DIFFICULTIES.find((difficulty) => difficulty === value) ?? "medium";

/** Pre-game choices: which side to play and how strong the engine should be. */
export const SetupScreen = ({ onStart }: SetupScreenProps): React.JSX.Element => {
  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onStart({ side: parseSide(form.get("side")), difficulty: parseDifficulty(form.get("difficulty")) });
  };

  return (
    <div className="flex w-full items-center justify-center gap-14">
      <StartingPosition />
      <form onSubmit={handleSubmit} className="flex w-full max-w-xl flex-col gap-8 lg:max-w-md">
        <div>
          <h1 className="font-display text-4xl leading-tight text-parchment sm:text-5xl">Take a seat</h1>
          <p className="mt-2 text-muted">Choose your pieces and how strong an opponent you want.</p>
        </div>

        <fieldset>
          <legend className="mb-3 font-display text-lg text-parchment">Play as</legend>
          <div className="grid grid-cols-3 gap-3">
            {SIDE_CHOICES.map((side) => (
              <SetupOption
                key={side}
                name="side"
                value={side}
                label={SIDE_NAMES[side]}
                defaultChecked={side === "w"}
                className="flex-col items-center gap-2 py-4"
              >
                <SideIcon side={side} />
              </SetupOption>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-3 font-display text-lg text-parchment">Difficulty</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {DIFFICULTIES.map((difficulty) => (
              <SetupOption
                key={difficulty}
                name="difficulty"
                value={difficulty}
                label={DIFFICULTY_INFO[difficulty].name}
                description={DIFFICULTY_INFO[difficulty].description}
                defaultChecked={difficulty === "medium"}
                className="flex-col gap-0.5"
              />
            ))}
          </div>
        </fieldset>

        <button type="submit" className={`${PRIMARY_BUTTON} self-start px-8 py-3 text-base`}>
          Start game
        </button>
      </form>
    </div>
  );
};
