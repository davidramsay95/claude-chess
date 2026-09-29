import type { PieceSymbol, Side } from "@/chess/game";
import { PIECE_NAMES, PieceGlyph } from "./PieceGlyph";

interface PlayerRowProps {
  name: string;
  detail?: string;
  /** Colour of the pieces this player has taken, i.e. the opponent's colour. */
  capturedColor: Side;
  captured: readonly PieceSymbol[];
  /** Material lead in pawns; only shown when positive. */
  lead: number;
  thinking?: boolean;
}

const ThinkingIndicator = (): React.JSX.Element => (
  <span aria-hidden className="ml-2 inline-flex items-center gap-1">
    <span className="thinking-dot size-1.5 rounded-full bg-brass" />
    <span className="thinking-dot size-1.5 rounded-full bg-brass" />
    <span className="thinking-dot size-1.5 rounded-full bg-brass" />
  </span>
);

const capturedLabel = (captured: readonly PieceSymbol[], lead: number): string => {
  const pieces =
    captured.length === 0 ? "No captures" : `Captured: ${captured.map((type) => PIECE_NAMES[type]).join(", ")}`;
  return lead > 0 ? `${pieces}. Ahead by ${lead}` : pieces;
};

/** A player's name with the pieces they have captured and their material lead. */
export const PlayerRow = ({
  name,
  detail,
  capturedColor,
  captured,
  lead,
  thinking = false,
}: PlayerRowProps): React.JSX.Element => (
  <div className="flex min-h-12 items-center gap-3">
    <span
      aria-hidden
      className={`mt-1.5 size-3 shrink-0 self-start rounded-full ring-1 ring-muted/60 ${capturedColor === "w" ? "bg-[#2c2724]" : "bg-[#f5eddc]"}`}
    />
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline">
        <span className="font-medium text-parchment">{name}</span>
        {detail && <span className="ml-2 text-sm text-muted">{detail}</span>}
        {thinking && <ThinkingIndicator />}
      </div>
      <div className="flex h-6 items-center" role="img" aria-label={capturedLabel(captured, lead)}>
        {captured.map((type, index) => (
          <PieceGlyph
            // Identical glyphs are interchangeable, so the index is a sufficient key.
            key={index}
            color={capturedColor}
            type={type}
            className={`size-6 ${index > 0 && captured[index - 1] === type ? "-ml-3.5" : ""}`}
          />
        ))}
        {lead > 0 && <span className="ml-1.5 text-sm font-semibold text-muted">+{lead}</span>}
      </div>
    </div>
  </div>
);
