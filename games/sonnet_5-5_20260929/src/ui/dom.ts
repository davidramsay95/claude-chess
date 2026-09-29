type Child = Node | string | null | undefined | false;

export interface ElementOptions {
  className?: string;
  text?: string;
  attrs?: Record<string, string>;
}

/** Small typed element builder so screens read as structure rather than string soup. */
export const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (options.className !== undefined) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  for (const [name, value] of Object.entries(options.attrs ?? {})) node.setAttribute(name, value);
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child);
  }
  return node;
};

export const button = (label: string, className: string, onClick: () => void, attrs: Record<string, string> = {}): HTMLButtonElement => {
  const node = el("button", { className, text: label, attrs: { type: "button", ...attrs } });
  node.addEventListener("click", onClick);
  return node;
};

const ICON_PATHS: Record<string, string> = {
  first: "M6 5V19M18 5L9 12L18 19Z",
  prev: "M15 5L8 12L15 19",
  next: "M9 5L16 12L9 19",
  last: "M18 5V19M6 5L15 12L6 19Z",
  flip: "M7 4L4 7L7 10M4 7H16A4 4 0 0 1 20 11M17 20L20 17L17 14M20 17H8A4 4 0 0 1 4 13",
  download: "M12 4V15M7 10L12 15L17 10M5 20H19",
  copy: "M9 9H19V20H9ZM5 15V4H15",
  flag: "M6 21V4M6 5H18L15 9L18 13H6",
  plus: "M12 5V19M5 12H19",
  upload: "M12 16V5M7 10L12 5L17 10M5 20H19",
};

/** Stroke icons drawn inline so the app needs no icon font or image files. */
export const icon = (name: keyof typeof ICON_PATHS | string): SVGSVGElement => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", ICON_PATHS[name] ?? "");
  svg.append(path);
  return svg;
};

export const iconButton = (name: string, label: string, onClick: () => void, className = "btn btn-icon"): HTMLButtonElement => {
  const node = el("button", { className, attrs: { type: "button", "aria-label": label, title: label } }, icon(name));
  node.addEventListener("click", onClick);
  return node;
};
