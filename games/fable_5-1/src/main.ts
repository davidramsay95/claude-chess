import "./style.css";
import { startSaveBridge } from "./bridge";
import { mountApp } from "./ui/app";
import { EngineClient } from "./ui/engineClient";
import { Game } from "./ui/game";

const root = document.querySelector<HTMLElement>("#app");
if (root === null) throw new Error("Missing #app root element");

const worker = new Worker(new URL("./engine/worker.ts", import.meta.url), { type: "module" });
const engine = new EngineClient(worker);
// The delay lets the browser paint the player's move before the engine starts searching.
const game = new Game(engine, { engineDelayMs: 220 });
const app = mountApp(root, game);

startSaveBridge(window, {
  getSave: () => {
    const state = game.exportState();
    return state === null ? null : { state, summary: { result: game.result(), moveCount: game.moves.length } };
  },
  loadState: (state) => {
    game.importState(state);
    app.revealGame();
  },
});
