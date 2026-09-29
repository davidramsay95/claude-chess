/** Save bridge: lets the host page save and restore the game over postMessage. See docs/save-bridge-protocol.md. */
export interface MessageTarget {
  postMessage: (message: unknown, targetOrigin: string) => void;
}

export interface BridgeEvent {
  origin: string;
  source: unknown;
  data: unknown;
}

export interface BridgeDeps {
  origin: string;
  parent: MessageTarget;
  /** Null when there is nothing to save yet. */
  getState: () => { state: unknown; summary: unknown } | null;
  /** Throws with a human-readable message when the state is invalid. */
  loadState: (state: unknown) => void;
}

const GAME = 'claude-chess-game';
const SHELL = 'claude-chess-shell';

export const createBridge = (deps: BridgeDeps): { handle: (event: BridgeEvent) => void; announceReady: () => void } => {
  const send = (message: Record<string, unknown>): void => deps.parent.postMessage({ source: GAME, ...message }, deps.origin);
  const announceReady = (): void => send({ type: 'ready' });

  const handle = (event: BridgeEvent): void => {
    if (event.origin !== deps.origin || event.source !== deps.parent) return;
    const data = event.data;
    if (typeof data !== 'object' || data === null) return;
    const message = data as Record<string, unknown>; // untrusted; each field is checked before use
    if (message.source !== SHELL) return;
    const { type, requestId } = message;
    if (type === 'ping') {
      announceReady();
    } else if (type === 'request-state' && typeof requestId === 'string') {
      const saved = deps.getState();
      send({ type: 'state', requestId, state: saved?.state ?? null, summary: saved?.summary ?? null });
    } else if (type === 'load-state' && typeof requestId === 'string') {
      try {
        deps.loadState(message.state);
        send({ type: 'loaded', requestId, ok: true });
      } catch (caught) {
        send({ type: 'loaded', requestId, ok: false, error: caught instanceof Error ? caught.message : 'Could not load state.' });
      }
    }
  };

  return { handle, announceReady };
};

/** Does nothing when the page is not embedded, because there is no host to talk to. */
export const installBridge = (win: Window, deps: Omit<BridgeDeps, 'origin' | 'parent'>): void => {
  if (win.parent === win) return;
  const bridge = createBridge({ ...deps, origin: win.location.origin, parent: win.parent });
  win.addEventListener('message', (event) => bridge.handle(event));
  bridge.announceReady();
};
