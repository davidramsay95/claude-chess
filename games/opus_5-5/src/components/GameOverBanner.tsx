import { useEffect, useRef } from "react";

interface GameOverBannerProps {
  message: string;
  detail: string;
  onNewGame: () => void;
  onReview: () => void;
}

/** Announces the result over the board; "Review board" tucks it away so the final position can be studied. */
export const GameOverBanner = ({ message, detail, onNewGame, onReview }: GameOverBannerProps): React.JSX.Element => {
  const newGameButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => newGameButtonRef.current?.focus(), []);

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-ink/35 p-4">
      <div
        role="alertdialog"
        aria-labelledby="game-over-title"
        aria-describedby="game-over-detail"
        className="w-full max-w-xs rounded-lg border border-walnut-edge bg-ink-raised/95 px-6 py-5 text-center shadow-[0_18px_40px_rgba(0,0,0,0.55)]"
      >
        <h2 id="game-over-title" className="font-display text-2xl leading-tight text-parchment">
          {message}
        </h2>
        <p id="game-over-detail" className="mt-1 text-sm text-muted">
          {detail}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            ref={newGameButtonRef}
            type="button"
            onClick={onNewGame}
            className="rounded-md bg-brass px-4 py-2.5 font-medium text-ink transition-colors hover:bg-brass-bright focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass-bright"
          >
            New game
          </button>
          <button
            type="button"
            onClick={onReview}
            className="rounded-md px-4 py-2 text-sm text-muted transition-colors hover:text-parchment focus-visible:outline-2 focus-visible:outline-brass-bright"
          >
            Review board
          </button>
        </div>
      </div>
    </div>
  );
};
