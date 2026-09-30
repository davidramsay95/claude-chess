import "./home.css";
import type { GameSummary } from "./gameSummary.ts";
import { renderBoard, renderChallengers } from "./home.ts";

// A Ruy Lopez after 3.Bb5, with the bishop's move highlighted.
const BOARD_PLACEMENT = "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R";
const LAST_MOVE = ["f1", "b5"];

const board = document.getElementById("board");
if (board === null) {
  throw new Error("Missing #board element");
}
renderBoard(board, BOARD_PLACEMENT, LAST_MOVE, "A chess position after 1.e4 e5 2.Nf3 Nc6 3.Bb5, with White's bishop on b5");

const challengers = document.getElementById("challengers");
if (challengers === null) {
  throw new Error("Missing #challengers element");
}
try {
  const response = await fetch("/games.json");
  if (!response.ok) {
    throw new Error(`Could not load games.json: ${response.status}`);
  }
  renderChallengers(challengers, (await response.json()) as GameSummary[]); // Shape is written by scripts/build-games.ts.
} catch (error) {
  console.error("Could not load the challenger list", error);
  challengers.replaceChildren();
  challengers.hidden = true;
}
