import { EngineClient } from './engine/engineClient';
import { App } from './ui/app';
import './ui/styles.css';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app root element');

const app = new App(root, new EngineClient());

if (import.meta.env.DEV) {
  // Dev-only handle for driving specific positions from the browser console.
  (window as unknown as { __chess: App }).__chess = app;
}
