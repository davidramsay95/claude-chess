import React from "react";

interface PieceProps {
  size?: number;
}

// Color theme
const W = { fill: "#f0d9b5", stroke: "#303030", strokeWidth: 1.5 };
const B = { fill: "#303030", stroke: "#f0d9b5", strokeWidth: 1.5 };

// ─── White pieces ────────────────────────────────────────────────────────────

export function WKing({ size = 45 }: PieceProps) {
  return (
    <svg viewBox="0 0 45 45" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      <g fill={W.fill} stroke={W.stroke} strokeWidth={W.strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        {/* Cross */}
        <rect x="20.5" y="1" width="4" height="8" rx="0.5" />
        <rect x="18" y="4" width="9" height="2.5" rx="0.5" />
        {/* Crown body */}
        <path d="M12 36 C12 32 14 29 14 25 C14 22.5 12.5 20 12.5 18 C12.5 15 15 13 17 13 L21 13 L22.5 9 L24 13 L28 13 C30 13 32.5 15 32.5 18 C32.5 20 31 22.5 31 25 C31 29 33 32 33 36 Z" />
        {/* Base */}
        <rect x="9" y="36" width="27" height="4" rx="1.5" />
      </g>
    </svg>
  );
}

export function WQueen({ size = 45 }: PieceProps) {
  return (
    <svg viewBox="0 0 45 45" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      <g fill={W.fill} stroke={W.stroke} strokeWidth={W.strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        {/* Crown balls */}
        <circle cx="6" cy="12" r="2.75" />
        <circle cx="14" cy="9" r="2.75" />
        <circle cx="22.5" cy="8" r="2.75" />
        <circle cx="31" cy="9" r="2.75" />
        <circle cx="39" cy="12" r="2.75" />
        {/* Skirt */}
        <path d="M6 12 L11 33 L34 33 L39 12 L31 21 L22.5 11 L14 21 Z" />
        {/* Base */}
        <rect x="9" y="33" width="27" height="4" rx="1.5" />
      </g>
    </svg>
  );
}

export function WRook({ size = 45 }: PieceProps) {
  return (
    <svg viewBox="0 0 45 45" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      <g fill={W.fill} stroke={W.stroke} strokeWidth={W.strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        {/* Battlements */}
        <rect x="9" y="1" width="8" height="6" rx="0.5" />
        <rect x="18.5" y="1" width="8" height="6" rx="0.5" />
        <rect x="28" y="1" width="8" height="6" rx="0.5" />
        {/* Body */}
        <rect x="11" y="7" width="23" height="20" rx="0" />
        {/* Neck */}
        <rect x="13" y="27" width="19" height="5" />
        {/* Base */}
        <rect x="9" y="32" width="27" height="5" rx="1.5" />
      </g>
    </svg>
  );
}

export function WBishop({ size = 45 }: PieceProps) {
  return (
    <svg viewBox="0 0 45 45" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      <g fill={W.fill} stroke={W.stroke} strokeWidth={W.strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        {/* Tip ball */}
        <circle cx="22.5" cy="5" r="2.5" />
        {/* Body */}
        <path d="M22.5 7.5 C17 12 14 18 14 24 C14 30 17 33 22.5 33 C28 33 31 30 31 24 C31 18 28 12 22.5 7.5 Z" />
        {/* Notch */}
        <path d="M18 22 Q22.5 19 27 22" stroke={W.stroke} strokeWidth={1.5} fill="none" />
        {/* Base */}
        <rect x="9" y="33" width="27" height="4" rx="1.5" />
      </g>
    </svg>
  );
}

export function WKnight({ size = 45 }: PieceProps) {
  return (
    <svg viewBox="0 0 45 45" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      <g fill={W.fill} stroke={W.stroke} strokeWidth={W.strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        {/* Horse head */}
        <path d="M22 10 C20 7 14 7 12 10 C10 13 10 18 12 21 C9 24 8 28 9 33 L36 33 C35 27 32 23 29 20 C31 16 30 11 27 9 C26 8 24 8 22 10 Z" />
        {/* Eye */}
        <circle cx="19" cy="14" r="1.5" fill={W.stroke} stroke="none" />
        {/* Nostril */}
        <circle cx="12.5" cy="20" r="1" fill={W.stroke} stroke="none" />
        {/* Base */}
        <rect x="9" y="33" width="27" height="4" rx="1.5" />
      </g>
    </svg>
  );
}

export function WPawn({ size = 45 }: PieceProps) {
  return (
    <svg viewBox="0 0 45 45" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      <g fill={W.fill} stroke={W.stroke} strokeWidth={W.strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="22.5" cy="9.5" r="5" />
        <path d="M17 18 C17 15 20 13 22.5 13 C25 13 28 15 28 18 L29 30 L16 30 Z" />
        <rect x="11" y="30" width="23" height="4" rx="1.5" />
      </g>
    </svg>
  );
}

// ─── Black pieces ────────────────────────────────────────────────────────────

export function BKing({ size = 45 }: PieceProps) {
  return (
    <svg viewBox="0 0 45 45" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      <g fill={B.fill} stroke={B.stroke} strokeWidth={B.strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <rect x="20.5" y="1" width="4" height="8" rx="0.5" />
        <rect x="18" y="4" width="9" height="2.5" rx="0.5" />
        <path d="M12 36 C12 32 14 29 14 25 C14 22.5 12.5 20 12.5 18 C12.5 15 15 13 17 13 L21 13 L22.5 9 L24 13 L28 13 C30 13 32.5 15 32.5 18 C32.5 20 31 22.5 31 25 C31 29 33 32 33 36 Z" />
        <rect x="9" y="36" width="27" height="4" rx="1.5" />
      </g>
    </svg>
  );
}

export function BQueen({ size = 45 }: PieceProps) {
  return (
    <svg viewBox="0 0 45 45" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      <g fill={B.fill} stroke={B.stroke} strokeWidth={B.strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="12" r="2.75" />
        <circle cx="14" cy="9" r="2.75" />
        <circle cx="22.5" cy="8" r="2.75" />
        <circle cx="31" cy="9" r="2.75" />
        <circle cx="39" cy="12" r="2.75" />
        <path d="M6 12 L11 33 L34 33 L39 12 L31 21 L22.5 11 L14 21 Z" />
        <rect x="9" y="33" width="27" height="4" rx="1.5" />
      </g>
    </svg>
  );
}

export function BRook({ size = 45 }: PieceProps) {
  return (
    <svg viewBox="0 0 45 45" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      <g fill={B.fill} stroke={B.stroke} strokeWidth={B.strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="1" width="8" height="6" rx="0.5" />
        <rect x="18.5" y="1" width="8" height="6" rx="0.5" />
        <rect x="28" y="1" width="8" height="6" rx="0.5" />
        <rect x="11" y="7" width="23" height="20" rx="0" />
        <rect x="13" y="27" width="19" height="5" />
        <rect x="9" y="32" width="27" height="5" rx="1.5" />
      </g>
    </svg>
  );
}

export function BBishop({ size = 45 }: PieceProps) {
  return (
    <svg viewBox="0 0 45 45" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      <g fill={B.fill} stroke={B.stroke} strokeWidth={B.strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="22.5" cy="5" r="2.5" />
        <path d="M22.5 7.5 C17 12 14 18 14 24 C14 30 17 33 22.5 33 C28 33 31 30 31 24 C31 18 28 12 22.5 7.5 Z" />
        <path d="M18 22 Q22.5 19 27 22" stroke={B.stroke} strokeWidth={1.5} fill="none" />
        <rect x="9" y="33" width="27" height="4" rx="1.5" />
      </g>
    </svg>
  );
}

export function BKnight({ size = 45 }: PieceProps) {
  return (
    <svg viewBox="0 0 45 45" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      <g fill={B.fill} stroke={B.stroke} strokeWidth={B.strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 10 C20 7 14 7 12 10 C10 13 10 18 12 21 C9 24 8 28 9 33 L36 33 C35 27 32 23 29 20 C31 16 30 11 27 9 C26 8 24 8 22 10 Z" />
        <circle cx="19" cy="14" r="1.5" fill={B.stroke} stroke="none" />
        <circle cx="12.5" cy="20" r="1" fill={B.stroke} stroke="none" />
        <rect x="9" y="33" width="27" height="4" rx="1.5" />
      </g>
    </svg>
  );
}

export function BPawn({ size = 45 }: PieceProps) {
  return (
    <svg viewBox="0 0 45 45" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      <g fill={B.fill} stroke={B.stroke} strokeWidth={B.strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="22.5" cy="9.5" r="5" />
        <path d="M17 18 C17 15 20 13 22.5 13 C25 13 28 15 28 18 L29 30 L16 30 Z" />
        <rect x="11" y="30" width="23" height="4" rx="1.5" />
      </g>
    </svg>
  );
}

// ─── Lookup table ────────────────────────────────────────────────────────────

type PieceComponent = React.FC<PieceProps>;

// pieceCode: W_PAWN=1..W_KING=6, B_PAWN=7..B_KING=12
const PIECE_COMPONENTS: Array<PieceComponent | null> = [
  null,       // 0 = empty
  WPawn, WKnight, WBishop, WRook, WQueen, WKing,  // 1-6 white
  BPawn, BKnight, BBishop, BRook, BQueen, BKing,  // 7-12 black
];

export function PieceIcon({ pieceCode, size = 45 }: { pieceCode: number; size?: number }) {
  const Component = PIECE_COMPONENTS[pieceCode];
  if (!Component) return null;
  return <Component size={size} />;
}
