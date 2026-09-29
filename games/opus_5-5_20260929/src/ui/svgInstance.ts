let instanceCounter = 0;

/**
 * Returns a copy of a piece SVG with unique gradient ids. `url(#id)` resolves to the first
 * element with that id in the whole document, and a gradient inside a hidden (display: none)
 * subtree does not paint, so shared ids make pieces render transparent.
 */
export const svgInstance = (svg: string): string => {
  instanceCounter += 1;
  const suffix = `-i${instanceCounter}`;
  return svg.replace(/(id="|url\(#)(opus55-grad-[a-z]+)/g, (_match, prefix: string, id: string) => `${prefix}${id}${suffix}`);
};
