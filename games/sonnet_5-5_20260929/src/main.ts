import "./style.css";
import { EngineClient } from "./engine/client";
import { createBridge } from "./bridge";
import { Session } from "./session";
import { EngineController } from "./ui/controller";
import { GameScreen } from "./ui/gameScreen";
import { ImportDialog } from "./ui/importDialog";
import { resolveColor } from "./ui/model";
import { buildSetupScreen } from "./ui/setup";

const mount = document.getElementById("app");
if (mount === null) throw new Error("Missing #app element");

const session = new Session();
// A short pause makes instant replies from the easy engine readable as a move rather than a flicker.
const controller = new EngineController(session, new EngineClient(), () => render(), 350);

const importDialog = new ImportDialog(session, () => render());
const setupScreen = buildSetupScreen({
  onStart: (choice, difficulty) => session.start(resolveColor(choice, Math.random), difficulty),
  onImport: () => importDialog.open(),
});
const gameScreen = new GameScreen(session, {
  isThinking: () => controller.thinking,
  cancelEngine: () => controller.cancel(),
  openImport: () => importDialog.open(),
});

const render = (): void => {
  const showingGame = session.game !== null;
  const wanted = showingGame ? gameScreen.root : setupScreen;
  if (mount.firstElementChild !== wanted) {
    mount.replaceChildren(wanted, importDialog.root);
    wanted.classList.add("screen-enter");
  }
  if (showingGame) gameScreen.render();
};

session.onChange = (): void => {
  controller.sync();
  render();
};

createBridge(window, session);
render();
