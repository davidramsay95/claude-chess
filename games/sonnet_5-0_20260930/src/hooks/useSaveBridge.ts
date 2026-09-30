import { useEffect, useRef } from "react";
import { GAME_SOURCE, handleBridgeMessage, type LoadStateResult, type OutgoingBridgeMessage } from "../lib/bridge";
import { computeSummary, exportGame, validateAndReplay, type GameRecord } from "../lib/gameRecord";

/**
 * Wires the pure `handleBridgeMessage` protocol handler up to the real
 * `window` messaging APIs. See `src/lib/bridge.ts` for the protocol logic
 * itself (that's what's unit-tested); this hook is thin glue.
 */
export function useSaveBridge(record: GameRecord | null, onLoad: (record: GameRecord) => void): void {
  const recordRef = useRef(record);
  const onLoadRef = useRef(onLoad);

  useEffect(() => {
    recordRef.current = record;
  }, [record]);

  useEffect(() => {
    onLoadRef.current = onLoad;
  }, [onLoad]);

  useEffect(() => {
    function postToParent(message: OutgoingBridgeMessage): void {
      if (typeof window === "undefined") return;
      // Harmless when running standalone: window.parent === window in that case.
      window.parent.postMessage(message, window.location.origin);
    }

    function onMessage(event: MessageEvent): void {
      handleBridgeMessage(
        { origin: event.origin, source: event.source, data: event.data },
        window.location.origin,
        window.parent,
        {
          getState: () => {
            const current = recordRef.current;
            if (!current) return { state: null, summary: null };
            return { state: exportGame(current), summary: computeSummary(current) };
          },
          loadState: (raw): LoadStateResult => {
            const result = validateAndReplay(raw);
            if (!result.ok) return { ok: false, error: result.error };
            onLoadRef.current(result.record);
            return { ok: true };
          },
          sendReady: () => postToParent({ source: GAME_SOURCE, type: "ready" }),
          sendState: (requestId, state, summary) =>
            postToParent({ source: GAME_SOURCE, type: "state", requestId, state, summary }),
          sendLoaded: (requestId, result) =>
            postToParent(
              result.ok
                ? { source: GAME_SOURCE, type: "loaded", requestId, ok: true }
                : { source: GAME_SOURCE, type: "loaded", requestId, ok: false, error: result.error },
            ),
        },
      );
    }

    window.addEventListener("message", onMessage);
    postToParent({ source: GAME_SOURCE, type: "ready" });

    return () => window.removeEventListener("message", onMessage);
  }, []);
}
