# Chess

A self-contained chess game built from scratch for the platform: a hand-rolled
rules engine, a minimax/alpha-beta AI opponent running off the main thread in
a Web Worker, and a React UI on top. No chess libraries (`chess.js` or
similar) are used anywhere — every rule, move generator, and evaluation
function in `src/engine` and `src/ai` is original code.

## Engine approach

- **Rules engine** (`src/engine`): a plain 0x88-free, 64-square array board
  representation (`Piece | null`, indexed `rank * 8 + file`). Move
  generation, check detection, castling, en passant, promotion, and draw
  detection (threefold repetition, the fifty-move rule, insufficient
  material) are all implemented directly against that array — see
  `src/engine/moves.ts` and `src/engine/rules.ts`. `GameState` is a plain,
  immutable, JSON-serializable object, so it can be freely cloned, sent
  through `postMessage`, or round-tripped through FEN
  (`src/engine/board.ts`) without any custom serialization step.
- **AI opponent** (`src/ai`): classic minimax with alpha-beta pruning and
  iterative deepening (`src/ai/search.ts`), bounded by a time budget rather
  than a fixed depth, so it never blocks past the ~4.5s allotted per move.
  Position scoring (`src/ai/evaluate.ts`) combines material and simple
  positional tables.
- **Web Worker** (`src/worker/engineWorker.ts`): the AI search runs inside a
  dedicated worker so the UI thread (and animations/interaction) never
  freezes while the engine thinks. The UI posts the current FEN + difficulty
  and gets a UCI move string back.

## Difficulty levels

All four levels share the same search code; they differ only in how much of
the tree they're allowed to explore (`src/ai/difficulty.ts`):

| Level  | Max depth | Quiescence search | Move randomness              |
| ------ | --------- | ------------------ | ----------------------------- |
| Easy   | 2 plies   | no                  | picks among top 3 root moves  |
| Medium | 3 plies   | no                  | picks among top 2 root moves  |
| Hard   | 4 plies   | yes                 | always plays the best move    |
| Expert | 6 plies   | yes                 | always plays the best move    |

Quiescence search extends capture sequences at leaf nodes so Hard/Expert
don't misjudge a position mid-exchange. The randomness on Easy/Medium is
deliberate: it keeps weaker levels from being perfectly deterministic and
lets the occasional non-optimal move through, without ever playing outright
illegal or nonsensical moves.

## UI

- **Setup screen** — choose to play White or Black and a difficulty before
  the game starts. Before a game has started there is no game in progress:
  the exported/bridge state is `null` in that state.
- **Board** — inline-SVG, hand-drawn pieces (no images, icon fonts, or chess
  webfonts anywhere — see `src/components/PieceIcon.tsx`). Click-to-move
  with legal destination highlighting, last-move and check highlighting, and
  a promotion dialog when a pawn reaches the last rank. The board disables
  interaction during the AI's turn and once the game has ended, and flips to
  match whichever color you're playing.
- **Move list** — live-updating SAN move pairs (`1. e4 e5 2. Nf3 Nc6`),
  including moves replayed via import.
- **Game end** — checkmate, stalemate, and each draw reason are detected and
  shown, plus a resign button and a "New game" button back to setup.
- **Export / Import** — download the current game as `.json`, copy it to the
  clipboard, or import a game from a file or pasted JSON. Import always
  validates the whole payload and replays every move through the real engine
  before touching anything on screen; a bad import leaves the current game
  untouched and shows an error.
- **Save bridge** — implements the platform's `window.postMessage`
  save/load protocol (`ready`/`ping`/`request-state`/`load-state`) so the
  hosting shell can save and restore a game. The bridge's `load-state`
  handler calls the exact same validate-and-replay function as the in-UI
  import, so the two can never drift apart (see `src/lib/gameRecord.ts` and
  `src/lib/bridge.ts`).
- **Sound** — optional Web Audio oscillator beeps for move/capture/check, no
  audio files shipped.

## Running locally

```sh
npm install
npm run dev       # starts the Vite dev server
npm test          # runs the full Vitest suite (rules engine, AI, worker, UI logic)
npm run build     # type-checks then builds for production into dist/
```

To build for the hosting platform's sub-path deployment:

```sh
npm run build -- --base=/play/sonnet_5-0_20260930/
```

## Known limitations

- Import/export only supports games that start from the standard starting
  position (`startFen` is always the standard start in practice), though the
  underlying validator accepts any legal FEN there.
- The AI has no opening book or endgame tablebase; all of its strength comes
  from search depth and static evaluation, so it can play unusual-looking
  moves in the opening and may not find the fastest mate in some endgames
  (particularly at Easy/Medium, by design).
- Move input is click-to-move only (no drag-and-drop).
- Sound effects are simple oscillator beeps, not sampled audio.
