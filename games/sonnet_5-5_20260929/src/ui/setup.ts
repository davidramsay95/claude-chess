import type { Difficulty } from "../state";
import { DIFFICULTIES } from "../state";
import { pieceSvg } from "../pieces";
import { KING, KNIGHT, makePiece } from "../engine/position";
import { button, el, icon } from "./dom";
import type { ColorChoice } from "./model";

export const DIFFICULTY_TEXT: Record<Difficulty, { label: string; blurb: string }> = {
  easy: { label: "Easy", blurb: "Plays casually and blunders." },
  medium: { label: "Medium", blurb: "Solid club level." },
  hard: { label: "Hard", blurb: "Strong tactical play." },
  expert: { label: "Expert", blurb: "Deepest search, thinks up to a few seconds." },
};

const COLOR_CHOICES: readonly { value: ColorChoice; label: string }[] = [
  { value: "white", label: "White" },
  { value: "random", label: "Random" },
  { value: "black", label: "Black" },
];

export interface SetupHandlers {
  onStart: (color: ColorChoice, difficulty: Difficulty) => void;
  onImport: () => void;
}

const radioCard = (
  group: string,
  value: string,
  checked: boolean,
  title: string,
  extra: Node | null,
  blurb: string | null,
): HTMLLabelElement => {
  const input = el("input", { className: "choice-input", attrs: { type: "radio", name: group, value } });
  input.checked = checked;
  const body = el("span", { className: "choice-body" }, el("span", { className: "choice-title", text: title }));
  if (blurb !== null) body.append(el("span", { className: "choice-blurb", text: blurb }));
  return el("label", { className: `choice choice-${group}` }, input, extra, body);
};

export const buildSetupScreen = (handlers: SetupHandlers): HTMLElement => {
  const colorGroup = el("div", { className: "choice-row", attrs: { role: "radiogroup", "aria-label": "Your colour" } });
  for (const choice of COLOR_CHOICES) {
    const swatch = el("span", { className: `swatch swatch-${choice.value}`, attrs: { "aria-hidden": "true" } });
    if (choice.value === "white") swatch.innerHTML = pieceSvg(makePiece(KING, 0));
    else if (choice.value === "black") swatch.innerHTML = pieceSvg(makePiece(KING, 1));
    else swatch.innerHTML = `${pieceSvg(makePiece(KNIGHT, 0))}${pieceSvg(makePiece(KNIGHT, 1))}`;
    colorGroup.append(radioCard("color", choice.value, choice.value === "white", choice.label, swatch, null));
  }

  const difficultyGroup = el("div", { className: "choice-list", attrs: { role: "radiogroup", "aria-label": "Difficulty" } });
  for (const level of DIFFICULTIES) {
    const text = DIFFICULTY_TEXT[level];
    const meter = el("span", { className: `meter meter-${DIFFICULTIES.indexOf(level) + 1}`, attrs: { "aria-hidden": "true" } });
    for (let index = 0; index < 4; index++) meter.append(el("i"));
    difficultyGroup.append(radioCard("difficulty", level, level === "medium", text.label, meter, text.blurb));
  }

  const selected = (name: string): string =>
    root.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value ?? "";

  const start = button("Start game", "btn btn-primary btn-large", () => {
    handlers.onStart(selected("color") as ColorChoice, selected("difficulty") as Difficulty);
  });

  const importButton = el("button", { className: "btn btn-quiet", attrs: { type: "button" } }, icon("upload"), "Import game");
  importButton.addEventListener("click", handlers.onImport);

  const root = el(
    "main",
    { className: "setup" },
    el(
      "header",
      { className: "setup-head" },
      el("p", { className: "eyebrow", text: "Sixty-four squares" }),
      el("h1", { className: "title", text: "Chess" }),
      el("p", { className: "lede", text: "A quiet game against an engine that runs entirely in your browser." }),
    ),
    el("section", { className: "setup-block" }, el("h2", { className: "block-title", text: "Play as" }), colorGroup),
    el("section", { className: "setup-block" }, el("h2", { className: "block-title", text: "Opponent strength" }), difficultyGroup),
    el("div", { className: "setup-actions" }, start, importButton),
  );
  return root;
};
