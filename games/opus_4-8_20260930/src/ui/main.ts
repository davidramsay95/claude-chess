import "./styles.css";
import { ChessApp } from "./app.ts";

const root = document.getElementById("app");
if (root) {
  new ChessApp(root);
}
