export interface MoveList {
  /** `selectedPly` is the number of half-moves shown on the board; 0 is the start position. */
  render(sans: readonly string[], selectedPly: number): void;
}

/** Numbered SAN pairs; each move is a button that selects that ply. */
export const createMoveList = (container: HTMLElement, onSelect: (ply: number) => void): MoveList => {
  container.classList.add("move-list");

  container.addEventListener("click", (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest<HTMLElement>("[data-ply]");
    if (!button) return;
    const ply = Number(button.dataset.ply);
    if (Number.isInteger(ply)) onSelect(ply);
  });

  const render = (sans: readonly string[], selectedPly: number): void => {
    container.replaceChildren();
    if (sans.length === 0) {
      const empty = document.createElement("p");
      empty.className = "move-list-empty";
      empty.textContent = "No moves yet.";
      container.append(empty);
      return;
    }
    for (let i = 0; i < sans.length; i += 2) {
      const row = document.createElement("div");
      row.className = "move-row";
      const number = document.createElement("span");
      number.className = "move-number";
      number.textContent = `${i / 2 + 1}.`;
      row.append(number);
      for (const offset of [0, 1]) {
        const san = sans[i + offset];
        if (san === undefined) break;
        const ply = i + offset + 1;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "move-button";
        button.dataset.ply = String(ply);
        button.textContent = san;
        if (ply === selectedPly) {
          button.classList.add("current");
          button.setAttribute("aria-current", "true");
        }
        row.append(button);
      }
      container.append(row);
    }
    const current = container.querySelector<HTMLElement>(".move-button.current");
    current?.scrollIntoView({ block: "nearest" });
  };

  return { render };
};
