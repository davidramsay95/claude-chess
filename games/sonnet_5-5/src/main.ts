import { EngineClient } from './engine/engineClient';
import { App } from './ui/app';
import { installBridge } from './ui/bridge';
import './ui/styles.css';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app root element');

const app = new App(root, new EngineClient());

installBridge(window, { getState: () => app.exportSave(), loadState: (state) => app.importSave(state) });

if (import.meta.env.DEV) {
  // Dev-only handle for driving specific positions from the browser console.
  (window as unknown as { __chess: App }).__chess = app;
}
