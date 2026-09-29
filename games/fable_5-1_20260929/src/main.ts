import "./styles.css";
import { createBridge } from "./bridge/bridge";
import { createApp } from "./ui/app";

const root = document.getElementById("app");
if (!root) throw new Error("Missing #app root element");

const app = createApp(root);

const bridge = createBridge(window, {
  getState: (): ReturnType<typeof app.getState> => app.getState(),
  loadState: (state: unknown): ReturnType<typeof app.loadFromState> => app.loadFromState(state),
});
bridge.start();
