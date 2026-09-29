import "./ui/styles.css";
import { EngineClient } from "./engine/engineClient";
import { createSessionBridgeHost, startBridge } from "./state/bridge";
import { ChessSession } from "./state/session";
import { App } from "./ui/app";

const root = document.getElementById("app");
if (!root) throw new Error("Missing #app root element");

const session = new ChessSession();
new App(root, session, new EngineClient());
// The bridge and the import dialog both go through the same session, so they share validation and replay.
startBridge(window, createSessionBridgeHost(session));
