import { gameName, type GameSummary } from "./gameSummary.ts";

const BOARD_SIZE = 8;
const FILES = "abcdefgh";

// Solid glyphs for both sides; colour comes from CSS so white pieces stay legible. The text
// variation selector stops platforms rendering the pawn as an emoji.
const GLYPHS: Readonly<Record<string, string>> = {
  k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟︎",
};

/** Expands the piece-placement field of a FEN string into eight ranks of eight squares, top rank first. */
export const parseFenPlacement = (placement: string): (string | null)[][] => {
  const ranks = placement.split("/");
  if (ranks.length !== BOARD_SIZE) {
    throw new Error(`Expected ${BOARD_SIZE} ranks but found ${ranks.length}`);
  }
  return ranks.map((rank) => {
    const squares: (string | null)[] = [];
    for (const character of rank) {
      const emptyCount = Number(character);
      if (Number.isInteger(emptyCount)) {
        squares.push(...Array<null>(emptyCount).fill(null));
      } else {
        squares.push(character);
      }
    }
    if (squares.length !== BOARD_SIZE) {
      throw new Error(`Expected ${BOARD_SIZE} files in rank "${rank}" but found ${squares.length}`);
    }
    return squares;
  });
};

/** Draws a static board from the piece-placement field of a FEN string. */
export const renderBoard = (
  container: HTMLElement,
  placement: string,
  highlightedSquares: readonly string[],
  description: string,
): void => {
  const rows = parseFenPlacement(placement);
  container.setAttribute("role", "img");
  container.setAttribute("aria-label", description);

  const squares = rows.flatMap((row, rowIndex) =>
    row.map((piece, fileIndex) => {
      const rank = BOARD_SIZE - rowIndex;
      const name = `${FILES[fileIndex]}${rank}`;
      const square = document.createElement("div");
      square.dataset.square = name;
      square.className = (fileIndex + rank - 1) % 2 === 0 ? "dark" : "light";
      square.classList.toggle("last-move", highlightedSquares.includes(name));
      if (piece !== null) {
        const glyph = document.createElement("span");
        const isWhite = piece === piece.toUpperCase();
        glyph.className = `piece ${isWhite ? "white" : "black"}`;
        glyph.textContent = GLYPHS[piece.toLowerCase()];
        square.append(glyph);
      }
      return square;
    }),
  );
  container.replaceChildren(...squares);
};

/** Fills the list with one link per game, each opening that game on the game page. */
export const renderChallengers = (list: HTMLElement, games: readonly GameSummary[]): void => {
  const items = games.map((game) => {
    const link = document.createElement("a");
    link.href = `/games#${game.slug}`;
    const name = document.createElement("span");
    name.className = "challenger-name";
    name.textContent = gameName(game);
    link.append(name);
    if (game.date) {
      const date = document.createElement("span");
      date.className = "challenger-date";
      date.textContent = game.date;
      link.append(date);
    }
    const item = document.createElement("li");
    item.append(link);
    return item;
  });
  list.replaceChildren(...items);
};
