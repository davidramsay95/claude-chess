import { useEffect } from "react";
import { createBridge } from "./gameBridge";
import type { SavedGame } from "./savedGame";

/**
 * Lets an embedding page save and restore the game. Both callbacks must be stable (useCallback),
 * otherwise the listener would be re-registered on every render. Does nothing outside an iframe.
 */
export const useSaveBridge = (getState: () => SavedGame | null, loadState: (state: unknown) => void): void => {
  useEffect(() => {
    if (window.parent === window) return;
    const bridge = createBridge({ origin: window.location.origin, parent: window.parent, getState, loadState });
    window.addEventListener("message", bridge.handleMessage);
    bridge.announceReady();
    return () => window.removeEventListener("message", bridge.handleMessage);
  }, [getState, loadState]);
};
