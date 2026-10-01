# Claude Chess

A collection of chess games, each written from scratch by a different Claude model working autonomously from the same brief ([`PROMPT.md`](PROMPT.md)). Every game has its own hand-written engine and its own design, and they all sit behind one switcher so you can play them against each other's work.

Play it at **https://claude-chess.com**.

This repository is the site that hosts them: a small shell app and a Cloudflare Worker API. It does not contain the games themselves. Each game lives in its own repository and is pulled in as a git submodule.

## The games

Each game is a submodule at `games/<model>_<version>-<subversion>_<YYYYMMDD>`, backed by a repo named `claude-chess_<folder>`. The date in a folder name is when the game was built; the date shown on the site is the model's release date.

| Model | Released | Repository |
|---|---|---|
| Sonnet 5.5 | 2026-09-28 | [claude-chess_sonnet_5-5_20260929](https://github.com/davidramsay95/claude-chess_sonnet_5-5_20260929) |
| Opus 5.5 | 2026-09-22 | [claude-chess_opus_5-5_20260929](https://github.com/davidramsay95/claude-chess_opus_5-5_20260929) |
| Fable 5.1 | 2026-09-01 | [claude-chess_fable_5-1_20260929](https://github.com/davidramsay95/claude-chess_fable_5-1_20260929) |
| Opus 5.0 | 2026-07-24 | [claude-chess_opus_5-0_20260930](https://github.com/davidramsay95/claude-chess_opus_5-0_20260930) |
| Sonnet 5.0 | 2026-06-30 | [claude-chess_sonnet_5-0_20260930](https://github.com/davidramsay95/claude-chess_sonnet_5-0_20260930) |
| Fable 5.0 | 2026-06-09 | [claude-chess_fable_5-0_20260930](https://github.com/davidramsay95/claude-chess_fable_5-0_20260930) |
| Opus 4.8 | 2026-05-28 | [claude-chess_opus_4-8_20260930](https://github.com/davidramsay95/claude-chess_opus_4-8_20260930) |
| Opus 4.7 | 2026-04-16 | [claude-chess_opus_4-7_20260930](https://github.com/davidramsay95/claude-chess_opus_4-7_20260930) |
| Sonnet 4.6 | 2026-02-17 | [claude-chess_sonnet_4-6_20260930](https://github.com/davidramsay95/claude-chess_sonnet_4-6_20260930) |
| Opus 4.6 | 2026-02-05 | [claude-chess_opus_4-6_20260930](https://github.com/davidramsay95/claude-chess_opus_4-6_20260930) |
| Haiku 4.5 | 2025-10-15 | [claude-chess_haiku_4-5_20260930](https://github.com/davidramsay95/claude-chess_haiku_4-5_20260930) |

The games are generated code and are kept in separate repositories so their dependencies, and any security alerts on them, stay out of this one.

## Layout

- `games/` one git submodule per game. A folder named `model_version-subversion` or `model_version-subversion_YYYYMMDD` appears in the switcher on the next build, and the date suffix lets several runs of one model version coexist. Each game must be a Vite or Next.js project. See "Adding a game" below.
- `apps/shell/` the site pages. `index.html` is the home page at `/`, `games.html` is the game page at `/games` with the model selector, which loads the selected game in a frame at `/play/<slug>/`.
- `worker/` the API: Better Auth sign-in, the D1-backed games API, and D1 migrations in `worker/migrations/`.
- `apps/shell/terms-of-service.html` and `apps/shell/privacy-policy.html` the legal pages, built as extra Vite entries and served at `/terms-of-service` and `/privacy-policy`. Update them when the data the app collects changes.
- `docs/save-bridge-protocol.md` the postMessage contract between the shell and each game, used to save and load games.
- `scripts/` discovers games, builds each under its own sub-path, and writes `dist/games.json`. `RELEASE_DATES` in `scripts/discover-games.ts` holds each model's release date, which the site shows and sorts by.
- `PROMPT.md` the brief given to a model that is creating a new game.

## Getting started

Clone with the submodules, otherwise `games/` is empty:

```sh
git clone --recurse-submodules https://github.com/davidramsay95/claude-chess.git
```

In an existing clone, run `git submodule update --init`.

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

Cloudflare Workers Builds should use `npm ci && npm run build:ci` as the build command and `npx wrangler deploy` as the deploy command. `build:ci` initialises the submodules first.

## Adding a game

Give a model `PROMPT.md`; it writes its game into a new folder under `games/` and must not run git. Then create the game's repo and link it:

```sh
slug=model_version-subversion_YYYYMMDD
mv games/$slug ../$slug && cd ../$slug
git init -b main && git add -A && git commit -m "Add $slug game"
gh repo create <your-account>/claude-chess_$slug --public --source=. --push
cd - && git submodule add https://github.com/<your-account>/claude-chess_$slug.git games/$slug
```

Then add the model's release date to `RELEASE_DATES` in `scripts/discover-games.ts`, and commit `.gitmodules` and the new submodule.

## Local API setup

Create `.dev.vars` (gitignored) with `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL=http://localhost:8787`, then apply migrations with `npx wrangler d1 migrations apply claude-chess --local`. Google and GitHub sign-in need `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`; a provider is enabled only when both of its values are set.

Never commit real secrets. Production values are set as Cloudflare secrets, for example with `npx wrangler secret put BETTER_AUTH_SECRET`.

## Saved games

Signed-in users can save the current game and load it later from the "Saved games" panel. The shell asks the game in its iframe for its state over postMessage and stores it through `/api/games`. Each game defines its own state format, which the API treats as opaque JSON. A new game must implement the bridge in `docs/save-bridge-protocol.md` to support saving.

## Not built yet

The tip button.
