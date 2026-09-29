import type { Side } from "@/chess/game";
import type { MaterialBalance } from "@/ui/material";
import { SECONDARY_BUTTON } from "./buttonStyles";
import { MoveList } from "./MoveList";
import { PlayerRow } from "./PlayerRow";
import { ResignControl } from "./ResignControl";

interface SidePanelProps {
  humanColor: Side;
  difficultyName: string;
  status: string;
  inCheck: boolean;
  thinking: boolean;
  engineError: string | null;
  sans: readonly string[];
  balance: MaterialBalance;
  gameOver: boolean;
  onRetry: () => void;
  onNewGame: () => void;
  onFlip: () => void;
  onResign: () => void;
}

const EngineError = ({ message, onRetry }: { message: string; onRetry: () => void }): React.JSX.Element => (
  <div className="flex items-start gap-3 rounded-md border border-check/40 bg-check/10 p-3">
    <p role="alert" className="flex-1 text-sm">
      The engine failed to reply: {message}
    </p>
    <button type="button" onClick={onRetry} className={`${SECONDARY_BUTTON} py-1`}>
      Retry
    </button>
  </div>
);

/** Everything beside the board: players, status, move list and game controls. */
export const SidePanel = ({
  humanColor,
  difficultyName,
  status,
  inCheck,
  thinking,
  engineError,
  sans,
  balance,
  gameOver,
  onRetry,
  onNewGame,
  onFlip,
  onResign,
}: SidePanelProps): React.JSX.Element => {
  const engineColor: Side = humanColor === "w" ? "b" : "w";
  const humanLead = humanColor === "w" ? balance.advantage : -balance.advantage;
  const capturedBy = (color: Side): MaterialBalance["capturedByWhite"] =>
    color === "w" ? balance.capturedByWhite : balance.capturedByBlack;

  return (
    <aside className="flex w-full flex-col gap-4 rounded-xl border border-ink-line bg-ink-raised p-4 lg:h-full lg:w-80 lg:shrink-0">
      <PlayerRow
        name="Engine"
        detail={difficultyName}
        capturedColor={humanColor}
        captured={capturedBy(engineColor)}
        lead={-humanLead}
        thinking={thinking}
      />

      <div className="border-y border-ink-line py-3">
        <p aria-live="polite" className={`font-display text-xl ${inCheck ? "text-check" : "text-parchment"}`}>
          {status}
        </p>
      </div>

      {engineError && <EngineError message={engineError} onRetry={onRetry} />}

      <section aria-labelledby="moves-heading" className="flex min-h-0 flex-col lg:flex-1">
        <h2 id="moves-heading" className="sr-only">
          Moves
        </h2>
        <MoveList sans={sans} />
      </section>

      <PlayerRow name="You" capturedColor={engineColor} captured={capturedBy(humanColor)} lead={humanLead} />

      <div className="grid grid-cols-3 gap-2 [&>button]:px-2 [&>button]:whitespace-nowrap">
        <button type="button" onClick={onNewGame} className={SECONDARY_BUTTON}>
          New game
        </button>
        <button type="button" onClick={onFlip} className={SECONDARY_BUTTON}>
          Flip board
        </button>
        <ResignControl disabled={gameOver} onResign={onResign} />
      </div>
    </aside>
  );
};
