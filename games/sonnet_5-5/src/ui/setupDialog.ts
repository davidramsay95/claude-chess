import type { Level } from '../engine/engineTypes';
import { button, el } from './dom';
import { LEVEL_OPTIONS, type Settings, type SidePreference } from './settings';

const SIDE_OPTIONS: readonly { value: SidePreference; label: string; glyph: string }[] = [
  { value: 'white', label: 'White', glyph: '♔' },
  { value: 'random', label: 'Random', glyph: '⚄' },
  { value: 'black', label: 'Black', glyph: '♚' },
];

/** Modal for choosing side and difficulty, built on the native dialog for focus trapping and Escape. */
export class SetupDialog {
  private readonly dialog = el('dialog', 'setup');
  private settings: Settings;
  private hasGame = false;
  private readonly onStart: (settings: Settings) => void;
  private readonly sideButtons = new Map<SidePreference, HTMLButtonElement>();
  private readonly levelButtons = new Map<Level, HTMLButtonElement>();
  private readonly description = el('p', 'level-description');
  private readonly cancelButton: HTMLButtonElement;

  constructor(initial: Settings, onStart: (settings: Settings) => void) {
    this.settings = { ...initial };
    this.onStart = onStart;
    this.dialog.setAttribute('aria-labelledby', 'setup-title');
    // Without a game to return to, Escape must not leave the user on a dead board.
    this.dialog.addEventListener('cancel', (event) => {
      if (!this.hasGame) event.preventDefault();
    });

    const title = el('h2', 'setup-title', 'New game');
    title.id = 'setup-title';
    const startButton = button('Start game', 'btn btn-primary', () => this.submit());
    this.cancelButton = button('Cancel', 'btn btn-quiet', () => this.dialog.close());
    const actions = el('div', 'setup-actions');
    actions.append(this.cancelButton, startButton);

    this.dialog.append(
      el('p', 'eyebrow', 'Chess'),
      title,
      this.buildSideGroup(),
      this.buildLevelGroup(),
      actions,
    );
    document.body.append(this.dialog);
    this.refresh();
  }

  open(hasGame: boolean): void {
    this.hasGame = hasGame;
    this.cancelButton.hidden = !hasGame;
    if (!this.dialog.open) this.dialog.showModal();
  }

  private submit(): void {
    this.dialog.close();
    this.onStart({ ...this.settings });
  }

  private buildSideGroup(): HTMLElement {
    const group = el('div', 'field');
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', 'Play as');
    group.append(el('span', 'field-label', 'Play as'));
    const row = el('div', 'choice-row three');
    for (const option of SIDE_OPTIONS) {
      const choice = button('', 'choice', () => {
        this.settings.side = option.value;
        this.refresh();
      });
      choice.setAttribute('role', 'radio');
      choice.append(el('span', 'choice-glyph', option.glyph), el('span', 'choice-text', option.label));
      this.sideButtons.set(option.value, choice);
      row.append(choice);
    }
    group.append(row);
    return group;
  }

  private buildLevelGroup(): HTMLElement {
    const group = el('div', 'field');
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', 'Difficulty');
    group.append(el('span', 'field-label', 'Difficulty'));
    const row = el('div', 'choice-row four');
    for (const option of LEVEL_OPTIONS) {
      const choice = button(option.label, 'choice choice-level', () => {
        this.settings.level = option.level;
        this.refresh();
      });
      choice.setAttribute('role', 'radio');
      this.levelButtons.set(option.level, choice);
      row.append(choice);
    }
    this.description.setAttribute('aria-live', 'polite');
    group.append(row, this.description);
    return group;
  }

  private refresh(): void {
    for (const [value, node] of this.sideButtons) {
      node.setAttribute('aria-checked', String(value === this.settings.side));
    }
    for (const [value, node] of this.levelButtons) {
      node.setAttribute('aria-checked', String(value === this.settings.level));
    }
    this.description.textContent = LEVEL_OPTIONS.find((o) => o.level === this.settings.level)?.description ?? '';
  }
}
