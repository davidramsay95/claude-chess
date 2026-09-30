import { initApp } from "./ui/board-ui.js";
import "./style.css";

const app = document.getElementById("app");
if (app) {
  initApp(app);
}
