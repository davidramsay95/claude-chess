import { el } from "./dom";
import type { MoveRow } from "./model";

/** Two-column numbered list. Rebuilt on change; it is small enough that this stays cheap. */
export class MoveList {
  readonly root: HTMLElement;
  private readonly body: HTMLElement;

  constructor(private readonly onSelect: (ply: number) => void) {
    this.body = el("ol", { className: "moves" });
    this.root = el("div", { className: "move-scroll", attrs: { tabindex: "-1", role: "region", "aria-label": "Move list" } }, this.body);
  }

  /** `currentPly` is the ply on display; `follow` scrolls to the newest move instead of the current one. */
  update(rows: readonly MoveRow[], currentPly: number, follow: boolean): void {
    this.body.replaceChildren();
    if (rows.length === 0) {
      this.body.append(el("li", { className: "moves-empty", text: "No moves yet." }));
      return;
    }
    let active: HTMLElement | null = null;
    for (const row of rows) {
      const cells: HTMLElement[] = [
        el("span", { className: "move-number", text: `${row.number}.` }),
        this.cell(row.white, currentPly, "…"),
        this.cell(row.black, currentPly, ""),
      ];
      for (const cell of cells) if (cell.classList.contains("current")) active = cell;
      this.body.append(el("li", { className: "move-row" }, ...cells));
    }
    const target = follow ? this.body.lastElementChild : active;
    if (target instanceof HTMLElement) this.scrollTo(target);
  }

  private cell(move: MoveRow["white"], currentPly: number, placeholder: string): HTMLElement {
    if (move === null) return el("span", { className: "move-cell move-empty", text: placeholder });
    const node = el("button", {
      className: `move-cell move-button${move.ply === currentPly ? " current" : ""}`,
      text: move.san,
      attrs: { type: "button", "aria-label": `Move ${move.ply}, ${move.san}` },
    });
    if (move.ply === currentPly) node.setAttribute("aria-current", "true");
    node.addEventListener("click", () => this.onSelect(move.ply));
    return node;
  }

  private scrollTo(target: HTMLElement): void {
    const container = this.root;
    const top = target.offsetTop;
    const bottom = top + target.offsetHeight;
    if (top < container.scrollTop) container.scrollTop = top;
    else if (bottom > container.scrollTop + container.clientHeight) container.scrollTop = bottom - container.clientHeight;
  }
}
