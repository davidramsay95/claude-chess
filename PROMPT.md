# Task

You are creating a chess game that will be hosted in a larger collection of Claude generated chess games. Work completely autonomously, as I will not be monitoring your progress. Let me know when you are finished and it is ready to play.

Do not copy any existing features from other versions of the game. Do not open or read any other folder inside `./games/`. You are to implement this 100% using your own code.

## The game

Create a fully playable chess game.

- Give me an option to start as white or black.
- Create the assets yourself (piece artwork, icons, sounds if you want them). Do not use external image files or chess piece fonts. Everything must ship inside your folder.
- You choose the language, framework and design, within the platform rules below.
- Implement a self-written chess engine that I will play against. Do not use any chess library (no chess.js, no Stockfish, no engine packages).
- Provide four difficulty levels: easy, medium, hard, expert. Each level must be clearly different in strength, and every level must reply within about 5 seconds. The engine must never freeze the interface (a Web Worker is the usual way).
- All rules of chess must be followed: legal move generation, check, checkmate, stalemate, castling (including the rules about passing through check), en passant, promotion to any piece, threefold repetition, the fifty-move rule, and insufficient material.
- Keep track of every move and show the move list.
- Let the user export the game state and import/replay a previous game state (see "Game state and save bridge").

## Where the game goes

Create one new folder inside `./games/`, named:

```
<model>_<version>-<subversion>_<YYYYMMDD>
```

- `<model>` is your model family in lowercase letters only, for example `fable`, `opus`, `sonnet`. No digits, hyphens or underscores.
- `<version>-<subversion>` are your version numbers, for example `5-1`.
- `<YYYYMMDD>` is today's date, for example `20260929`.
- Example: `fable_5-1_20260929`.

The platform finds games by this exact name. A folder that does not match is silently ignored and will never appear on the site.

Only create files inside your new folder. Do not edit anything else in the repository. Do not run git commands and do not create a nested git repository. Add a `.gitignore` to your folder that excludes `node_modules`, `dist`, `out` and `.next`, and add a short `README.md` describing your engine and how to run the game.

## Platform rules (these decide whether your game appears on the site)

The site builds every game folder with `npm ci` followed by `npm run build` on Node 24 and npm 10, then serves the result as static files at `/play/<your-folder-name>/`.

1. **Static client-only app built with Vite or Next.js.** You may use any framework that works with Vite (vanilla, React, Vue, Svelte, and so on) or Next.js with a static export. The platform detects `vite` or `next` in your `package.json` dependencies or devDependencies. Use npm only, not pnpm or yarn.
2. **`package.json` needs a `build` script.** It must succeed with no environment variables set beyond the ones described below, and it must include your typecheck if you use TypeScript (a type error fails the whole build).
3. **Commit a `package-lock.json` that is in sync** with `package.json`. Generate it with npm. A lockfile that is out of sync fails `npm ci` and the site build.
4. **No server code.** No API routes, server actions, middleware, server rendering, or calls to your own backend. Everything runs in the browser.
5. **The game is served from a sub-path, so never use root-absolute URLs for your own files** (for example `/pieces/wk.svg`, `/favicon.svg`, `url(/img/x.png)`). This applies to HTML, CSS, JavaScript and workers.
   - **Vite:** the platform runs `npm run build -- --base=/play/<your-folder-name>/`. Do not set `base` in your Vite config. Import assets from your source files so Vite rewrites them, or build URLs from `import.meta.env.BASE_URL`. Web workers should be created with `new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })`. The output directory must be `dist`.
   - **Next.js:** the platform runs `npm run build` with the environment variable `NEXT_BASE_PATH=/play/<your-folder-name>` (no trailing slash). Your `next.config` must read it, use a static export, and expose it to client code so files in `public/` can be prefixed:
     ```ts
     const basePath = process.env.NEXT_BASE_PATH ?? "";
     const nextConfig = {
       output: "export",
       basePath,
       images: { unoptimized: true },
       env: { NEXT_PUBLIC_BASE_PATH: basePath },
     };
     export default nextConfig;
     ```
     The export directory must be `out`. Prefix every `public/` asset URL with `process.env.NEXT_PUBLIC_BASE_PATH`, including URLs written inside CSS or Tailwind classes, because Next does not rewrite those.
6. **The game runs inside an iframe** that fills the page below a slim header. It must work at any width from a phone (about 360px) to a desktop, size itself to the iframe rather than the whole screen, never use `window.top`, and never try to navigate or break out of the frame. It must also still work when opened on its own.
7. **No network needed to play.** Web fonts are fine if the game still looks acceptable without them. Store nothing on a server. If you use `localStorage`, prefix every key with your folder name so games do not overwrite each other.

## Game state and save bridge

Saving games works through a small message protocol between the site and your game. Read these three files before you write any code:

- `./game_state.json` shows the exact game state object you must export and import. Use this shape exactly, so saved games are portable between models.
- `./docs/save-bridge-protocol.md` is the contract for the messages your game must answer.
- `./docs/examples/bridge-exchange.example.json` shows every message in order, including the error cases.

The state object:

| Field | Meaning |
|---|---|
| `version` | Always `1`. |
| `startFen` | FEN of the position the game started from. Use the standard start position. |
| `playerColor` | `"white"` or `"black"`. This is the colour the human plays. |
| `difficulty` | `"easy"`, `"medium"`, `"hard"` or `"expert"`. |
| `moves` | Every half-move played, in order, as UCI strings such as `e2e4`. Castling is the king moving two squares (`e1g1`). Promotion adds the piece letter (`e7e8q`). |
| `resigned` | `true` if the human resigned. |

Your game must do both of these:

1. **In the interface:** an "Export game" action that gives the user this state as a downloadable `.json` file (or copy to clipboard), and an "Import game" action that accepts such a file or pasted text, then restores the position with the full move list so the user can keep playing or step back through it.
2. **Over the message bridge**, as described in `docs/save-bridge-protocol.md`: send `ready` on load, answer `ping`, `request-state` and `load-state`, send `null` for state and summary while no game has started, and report `ok: false` with a short error for an invalid state.

Importing must validate the whole state and replay every move through your own rules before changing anything. If the state is invalid, for example an illegal move, show or return an error and leave the current game exactly as it was. Only accept bridge messages when `event.origin === window.location.origin` and `event.source === window.parent`. Both import paths (the interface and the bridge) should use the same code.

## Testing

Write tests as you go, and write each test before the code it checks. At a minimum:

- Move generation is correct. Use perft counts from the standard start position (20, 400, 8,902, 197,281 at depths 1 to 4) and at least one tricky position such as Kiwipete (`r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq -`, with 48, 2,039, 97,862 at depths 1 to 3).
- Special rules: castling, en passant, promotion, checkmate, stalemate, repetition, fifty-move, insufficient material.
- Export then import gives an identical state, and invalid states are rejected without changing the game.
- The bridge answers each message type and ignores messages from the wrong origin or source.

## Before you tell me you are finished

Run every check below in your folder and fix anything that fails. Replace `<folder>` with your folder name. Do not report completion until all of them pass.

1. **Clean install:** `rm -rf node_modules && npm ci` succeeds.
2. **Tests:** your test command passes.
3. **Platform build:**
   - Vite: `npm run build -- --base=/play/<folder>/`
   - Next.js: `NEXT_BASE_PATH=/play/<folder> npm run build`

   It must produce `dist` (Vite) or `out` (Next.js) containing an `index.html`.
4. **No root-absolute URLs:** from your folder run the following, replacing `dist` with `out` for Next.js. It must print nothing.
   ```sh
   grep -rhoE '(src|href)="/[^"]*"' dist | grep -v '="/play/<folder>/'
   ```
   Also search your source and CSS for `url(/` and for string literals that start with `"/` and point at your own files.
5. **Serve it under the sub-path and open it:**
   ```sh
   mkdir -p /tmp/site/play && rm -rf /tmp/site/play/<folder> && cp -r dist /tmp/site/play/<folder>
   cd /tmp/site && python3 -m http.server 8080
   ```
   Then load `http://localhost:8080/play/<folder>/`. If you have a browser or automation tool, play a real game: start as white, start as black, make moves, and confirm the engine answers at all four levels. Check that no request fails with a 404, in particular your piece images, because the grep in check 4 cannot see URLs that are built inside JavaScript.
6. **Bridge in an iframe:** if you can drive a browser, create `/tmp/site/host.html` with an iframe pointing at your game, and from it send `ping`, `request-state` and `load-state` messages exactly as in `docs/examples/bridge-exchange.example.json`. Confirm the replies, and confirm a bad state is rejected and leaves the game unchanged. If you cannot drive a browser, say so in your report, and make sure your unit tests cover the bridge with a fake parent window.

## What to report when you finish

Reply with:

- The folder name you created.
- The stack you chose and why.
- How to run it locally, and the commands for tests and build.
- The result of each of the six checks above, and anything you could not verify.
- Known limitations or rules you did not implement.
