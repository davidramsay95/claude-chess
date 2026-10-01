# Claude Chess

Hosts the chess games written by each model in `games/` behind one switcher, served from a single Cloudflare Worker with static assets.

## Layout

- `games/<model>_<version>-<subversion>/` one self-contained game per model, each a git submodule pointing at its own `claude-chess_<folder>` repo so the generated code and its dependency alerts stay out of this repo. A folder named `model_version-subversion` or `model_version-subversion_YYYYMMDD` appears in the switcher on the next build; see "Adding a game" below. The date suffix lets several runs of one model version coexist. `PROMPT.md` is the brief to give a model that is creating a new game. Each must be a Vite or Next.js project.
- `apps/shell/` the site pages. `index.html` is the home page at `/`, `games.html` is the game page at `/games` with the model selector, which loads the selected game in a frame at `/play/<slug>/`.
- `worker/` the API: Better Auth sign-in, the D1-backed games API, and D1 migrations in `worker/migrations/`.
- `apps/shell/terms-of-service.html` and `apps/shell/privacy-policy.html` the legal pages, built as extra Vite entries and served at `/terms-of-service` and `/privacy-policy`. Update them when the data the app collects changes.
- `docs/save-bridge-protocol.md` the postMessage contract between the shell and each game, used to save and load games.
- `scripts/` discovers games, builds each under its own sub-path, and writes `dist/games.json`.

## Commands

```sh
npm install
npm --prefix apps/shell install
npm --prefix worker install
npm run build:games -- --skip-install   # local: reuse installed game dependencies
npm run build                           # games, then shell, into dist/
npm run dev                             # serve dist/ locally through wrangler
npm test                                # scripts tests
npm --prefix apps/shell test            # shell tests
npm --prefix worker test                # API tests, run in the Workers runtime
```

Cloudflare Workers Builds should use `npm ci && npm run build:ci` as the build command and `npx wrangler deploy` as the deploy command.

## Local API setup

Create `.dev.vars` (gitignored) with `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL=http://localhost:8787`, then apply migrations with `npx wrangler d1 migrations apply claude-chess --local`. Google and GitHub sign-in need `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`; a provider is enabled only when both of its values are set.

## Saved games

Signed-in users can save the current game and load it later from the "Saved games" panel. The shell asks the game in its iframe for its state over postMessage and stores it through `/api/games`. Each game defines its own state format, which the API treats as opaque JSON. A new game must implement the bridge in `docs/save-bridge-protocol.md` to support saving.

## Not built yet

The tip button.```sh
slug=model_version-subversion_YYYYMMDD
mv games/$slug ../$slug && cd ../$slug
git init -b main && git add -A && git commit -m "Add $slug game"
gh repo create davidramsay95/claude-chess_$slug --public --source=. --push
cd - && git submodule add https://github.com/davidramsay95/claude-chess_$slug.git games/$slug
```
laude Chess

Hosts the chess games written by each model in `games/` behind one switcher, served from a single Cloudflare Worker with static assets.

## Layout

- `games/<model>_<version>-<subversion>/` one self-contained game per model, each a git submodule pointing at its own `claude-chess_<folder>` repo so the generated code and its dependency alerts stay out of this repo. A folder named `model_version-subversion` or `model_version-subversion_YYYYMMDD` appears in the switcher on the next build; see "Adding a game" below. The date suffix lets several runs of one model version coexist. `PROMPT.md` is the brief to give a model that is creating a new game. Each must be a Vite or Next.js project.
- `apps/shell/` the site pages. `index.html` is the home page at `/`, `games.html` is the game page at `/games` with the model selector, which loads the selected game in a frame at `/play/<slug>/`.
- `worker/` the API: Better Auth sign-in, the D1-backed games API, and D1 migrations in `worker/migrations/`.
- `apps/shell/terms-of-service.html` and `apps/shell/privacy-policy.html` the legal pages, built as extra Vite entries and served at `/terms-of-service` and `/privacy-policy`. Update them when the data the app collects changes.
- `docs/save-bridge-protocol.md` the postMessage contract between the shell and each game, used to save and load games.
- `scripts/` discovers games, builds each under its own sub-path, and writes `dist/games.json`.

## Commands

```sh
npm install
npm --prefix apps/shell install
npm --prefix worker install
npm run build:games -- --skip-install   # local: reuse installed game dependencies
npm run build                           # games, then shell, into dist/
npm run dev                             # serve dist/ locally through wrangler
npm test                                # scripts tests
npm --prefix apps/shell test            # shell tests
npm --prefix worker test                # API tests, run in the Workers runtime
```

Cloudflare Workers Builds should use `npm ci && npm run build:ci` as the build command and `npx wrangler deploy` as the deploy command.

## Local API setup

Create `.dev.vars` (gitignored) with `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL=http://localhost:8787`, then apply migrations with `npx wrangler d1 migrations apply claude-chess --local`. Google and GitHub sign-in need `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`; a provider is enabled only when both of its values are set.

## Saved games

Signed-in users can save the current game and load it later from the "Saved games" panel. The shell asks the game in its iframe for its state over postMessage and stores it through `/api/games`. Each game defines its own state format, which the API treats as opaque JSON. A new game must implement the bridge in `docs/save-bridge-protocol.md` to support saving.

## Not built yet

The tip button.
