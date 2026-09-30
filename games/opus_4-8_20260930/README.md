# Opus Chess

A fully playable chess game with an engine written entirely from scratch for
this project. No chess library, no piece fonts, no external image files — the
board logic, the AI, and the piece artwork are all in this folder.

Built with **Vite + TypeScript (vanilla, no UI framework)**. The engine runs in
a **Web Worker** so searching never blocks the interface.

## Running it

```sh
npm install      # install dev dependencies (Vite, Vitest, TypeScript)
npm run dev      # start the dev server and open the printed URL
```

Other scripts:

```sh
npm test         # run the test suite (Vitest)
npm run typecheck# strict TypeScript check, no emit
npm run build    # typecheck + production build to ./dist
```

The production build is a static, client-only app. It is served from a
sub-path (`/play/<folder>/`), so every asset URL is resolved through Vite's
`base`; nothing uses a root-absolute path.

## The engine

- **Board representation:** a `0x88` mailbox (a 128-cell array). Off-board
  squares are detected with a single `(sq & 0x88)` mask, which keeps sliding
  moves and knight jumps branch-free at the edges.
- **Move generation:** pseudo-legal moves are generated, then filtered by
  making each move and rejecting any that leaves the mover's king in check.
  Correctness is pinned by `perft` node counts from the standard position
  (20 / 400 / 8,902 / 197,281) and from Kiwipete plus three other tricky
  positions (see `tests/perft.test.ts`).
- **All rules:** legal moves, check, checkmate, stalemate, castling (including
  the pass-through-check rules), en passant, promotion to any piece, threefold
  repetition, the fifty-move rule, and insufficient material.
- **Search:** negamax with alpha-beta pruning, iterative deepening, a
  quiescence search for the stronger levels, and MVV-LVA move ordering.
- **Evaluation:** material plus piece-square tables, with a king table that
  shifts toward the centre as the endgame approaches.

### Difficulty levels

Every level answers in well under five seconds, enforced by a per-level time
budget (the engine returns the best move from the last completed depth):

| Level  | Depth | Quiescence | Style |
|--------|-------|------------|-------|
| Easy   | 2     | no         | often plays a sub-optimal or random move |
| Medium | 3     | no         | solid, small amount of variety |
| Hard   | 4     | yes        | plays the best move it finds |
| Expert | up to 6 | yes      | deepest search, strongest play |

## Features

- Choose to play as **White or Black**; the board orients to your side.
- Full **move list** in algebraic notation, click any move to review the
  position; step back and forward with the review controls.
- **Promotion picker**, check/last-move highlighting, legal-move hints.
- **Export** the game to a portable `.json` (download or copy) and **Import**
  it back (file or pasted text). Both paths validate and replay the whole game
  through the engine's own rules before changing anything.
- **Resign** and **New game**.
- The in-progress game is autosaved to `localStorage` (keys prefixed with the
  folder name) and resumes on reload.

## Save bridge

The game answers the shell's `postMessage` protocol
(`docs/save-bridge-protocol.md`): it sends `ready` on load and replies to
`ping`, `request-state`, and `load-state`. It only accepts messages where
`event.origin === window.location.origin` and `event.source === window.parent`,
returns `null` state/summary before a game has started, and reports
`ok: false` with a short error for an invalid state without disturbing the
current game. The interface's Import and the bridge's `load-state` share the
same validate-and-replay code.

## Project layout

```
src/engine/   board (0x88), move generation, rules, evaluation, search, notation
src/game/     Game model, portable state export/import, the message bridge
src/worker/   the engine Web Worker and its message protocol
src/ui/        app controller, board rendering, SVG piece artwork, styles
tests/        perft, special rules, export/import, search, and bridge tests
```

## Known limitations

- No opening book; the engine plays purely from search, so early moves vary.
- No transposition table — the search is kept deliberately simple. Expert is a
  strong club-level opponent, not a master-strength engine.
- Draws (threefold, fifty-move, insufficient material) are detected and applied
  automatically; there is no separate "claim draw" step.
- Moves are made by tapping/clicking (select then destination); there is no
  drag-and-drop.
