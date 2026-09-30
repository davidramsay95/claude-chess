import { GameManager, GameStateExport } from './gameManager';

interface BridgeMessage {
  type: 'ping' | 'request-state' | 'load-state';
  state?: GameStateExport;
}

interface BridgeResponse {
  type: string;
  ok?: boolean;
  state?: GameStateExport | null;
  summary?: string | null;
  error?: string;
}

export class BridgeHandler {
  private gameManager: GameManager;

  constructor(gameManager: GameManager) {
    this.gameManager = gameManager;
    this.setupMessageListener();
  }

  private setupMessageListener(): void {
    window.addEventListener('message', (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== window.parent) return;

      const message: BridgeMessage = event.data;
      const response = this.handleMessage(message);
      window.parent.postMessage(response, '*');
    });
  }

  private handleMessage(message: BridgeMessage): BridgeResponse {
    switch (message.type) {
      case 'ping':
        return { type: 'ping', ok: true };

      case 'request-state': {
        const history = this.gameManager.getMoveHistory();
        if (history.length === 0) {
          return { type: 'request-state', ok: true, state: null, summary: null };
        }
        const state = this.gameManager.exportGameState();
        const summary = `${state.moves.length} moves, ${state.playerColor} to play`;
        return { type: 'request-state', ok: true, state, summary };
      }

      case 'load-state': {
        if (!message.state) {
          return { type: 'load-state', ok: false, error: 'No state provided' };
        }

        if (message.state.version !== 1) {
          return { type: 'load-state', ok: false, error: 'Invalid state version' };
        }

        const success = this.gameManager.importGameState(message.state);
        if (!success) {
          return { type: 'load-state', ok: false, error: 'Invalid game state' };
        }

        return { type: 'load-state', ok: true, state: message.state };
      }

      default:
        return { type: 'unknown', ok: false, error: 'Unknown message type' };
    }
  }

  sendReady(): void {
    window.parent.postMessage({ type: 'ready', ok: true }, '*');
  }
}
