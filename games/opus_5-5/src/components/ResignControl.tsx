import { useState } from "react";
import { SECONDARY_BUTTON } from "./buttonStyles";

interface ResignControlProps {
  disabled: boolean;
  onResign: () => void;
}

/** Resign button that asks for confirmation in place instead of opening a browser dialog. */
export const ResignControl = ({ disabled, onResign }: ResignControlProps): React.JSX.Element => {
  const [confirming, setConfirming] = useState(false);

  if (!confirming || disabled) {
    return (
      <button type="button" disabled={disabled} onClick={() => setConfirming(true)} className={SECONDARY_BUTTON}>
        Resign
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label="Confirm resignation"
      className="col-span-full flex flex-wrap items-center gap-2 rounded-md border border-check/40 bg-check/10 p-2 [&>button]:flex-1"
    >
      <span className="w-full pl-1 text-sm">Resign this game?</span>
      <button
        type="button"
        onClick={onResign}
        className="rounded-md bg-check px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#e05a4b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass-bright"
      >
        Yes, resign
      </button>
      <button type="button" onClick={() => setConfirming(false)} className={`${SECONDARY_BUTTON} py-1.5`}>
        Keep playing
      </button>
    </div>
  );
};
