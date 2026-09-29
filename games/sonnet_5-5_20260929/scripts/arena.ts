import { chooseMove } from "../src/engine/search";
import { Game } from "../src/engine/game";
import { START_FEN } from "../src/engine/position";
import type { Difficulty } from "../src/state";

const playGame = (white: Difficulty, black: Difficulty, scale: number): { result: string; slowest: number } => {
  const game = new Game(START_FEN);
  let slowest = 0;
  while (game.status().result === "*" && game.moves.length < 300) {
    const level = game.position.side === 0 ? white : black;
    const started = performance.now();
    const { move } = chooseMove(START_FEN, game.moves, level, scale);
    slowest = Math.max(slowest, performance.now() - started);
    if (move === null || !game.playUci(move)) break;
  }
  const status = game.status();
  return { result: status.result === "*" ? "1/2-1/2" : status.result, slowest };
};

const [a, b, gamesText, scaleText] = process.argv.slice(2);
const games = Number(gamesText ?? 6);
const scale = Number(scaleText ?? 0.2);
let scoreA = 0;
let slowest = 0;
for (let i = 0; i < games; i++) {
  const aWhite = i % 2 === 0;
  const { result, slowest: s } = aWhite ? playGame(a as Difficulty, b as Difficulty, scale) : playGame(b as Difficulty, a as Difficulty, scale);
  slowest = Math.max(slowest, s);
  const won = result === "1/2-1/2" ? 0.5 : (result === "1-0") === aWhite ? 1 : 0;
  scoreA += won;
  console.log(`game ${i + 1}: ${result} (${a} as ${aWhite ? "white" : "black"})`);
}
console.log(`${a} scored ${scoreA}/${games} against ${b}; slowest move ${Math.round(slowest)}ms`);
