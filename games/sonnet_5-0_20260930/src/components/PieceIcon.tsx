import type { JSX } from "react";
import type { Color, PieceType } from "../engine/index";

interface PieceIconProps {
  type: PieceType;
  color: Color;
}

/**
 * Hand-drawn (geometric/path-based) chess piece glyphs. No external image
 * files, icon fonts, or chess-piece webfonts are used anywhere — every
 * shape below is plain inline SVG built from basic primitives, distinct
 * enough at a glance to read as pawn/knight/bishop/rook/queen/king.
 */
export function PieceIcon({ type, color }: PieceIconProps): JSX.Element {
  const fill = color === "white" ? "var(--piece-white-fill)" : "var(--piece-black-fill)";
  const stroke = color === "white" ? "var(--piece-white-stroke)" : "var(--piece-black-stroke)";

  return (
    <svg
      viewBox="0 0 100 100"
      className={`piece-icon piece-icon--${color}`}
      aria-hidden="true"
      focusable="false"
    >
      <g fill={fill} stroke={stroke} strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round">
        {renderShape(type)}
      </g>
    </svg>
  );
}

function renderShape(type: PieceType): JSX.Element {
  switch (type) {
    case "p":
      return <Pawn />;
    case "n":
      return <Knight />;
    case "b":
      return <Bishop />;
    case "r":
      return <Rook />;
    case "q":
      return <Queen />;
    case "k":
      return <King />;
  }
}

function Base(): JSX.Element {
  return <ellipse cx={50} cy={88} rx={26} ry={7} />;
}

function Pawn(): JSX.Element {
  return (
    <>
      <Base />
      <path d="M36 84 L40 58 Q30 50 34 38 Q38 28 50 28 Q62 28 66 38 Q70 50 60 58 L64 84 Z" />
      <circle cx={50} cy={26} r={13} />
    </>
  );
}

function Knight(): JSX.Element {
  return (
    <>
      <Base />
      <path d="M30 84 L28 62 Q24 48 34 38 Q30 28 40 20 Q46 14 56 16 Q52 20 54 24 Q64 24 70 32 Q76 40 72 48 Q68 44 62 44 Q66 50 64 58 L70 84 Z" />
      <circle cx={58} cy={30} r={2.6} fill="var(--piece-eye)" stroke="none" />
      <path d="M42 22 L48 28 L40 28 Z" />
    </>
  );
}

function Bishop(): JSX.Element {
  return (
    <>
      <Base />
      <path d="M34 84 L38 66 Q28 56 34 44 Q40 32 50 24 Q60 32 66 44 Q72 56 62 66 L66 84 Z" />
      <line x1={42} y1={46} x2={58} y2={38} stroke="var(--piece-eye)" strokeWidth={3} />
      <circle cx={50} cy={14} r={7} />
    </>
  );
}

function Rook(): JSX.Element {
  return (
    <>
      <Base />
      <path d="M32 84 L36 52 L30 52 L30 22 L40 22 L40 28 L48 28 L48 22 L52 22 L52 28 L60 28 L60 22 L70 22 L70 52 L64 52 L68 84 Z" />
    </>
  );
}

function Queen(): JSX.Element {
  return (
    <>
      <Base />
      <path d="M32 84 L36 58 Q28 54 28 46 L32 30 L40 42 L44 26 L50 40 L56 26 L60 42 L68 30 L72 46 Q72 54 64 58 L68 84 Z" />
      <circle cx={28} cy={28} r={4} />
      <circle cx={40} cy={22} r={4} />
      <circle cx={50} cy={18} r={4.5} />
      <circle cx={60} cy={22} r={4} />
      <circle cx={72} cy={28} r={4} />
    </>
  );
}

function King(): JSX.Element {
  return (
    <>
      <Base />
      <path d="M32 84 L36 56 Q28 50 30 40 Q32 30 42 26 L58 26 Q68 30 70 40 Q72 50 64 56 L68 84 Z" />
      <path d="M50 10 L50 24 M43 17 L57 17" stroke={"var(--piece-eye)"} strokeWidth={4} />
      <rect x={45} y={22} width={10} height={8} />
    </>
  );
}
