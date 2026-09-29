# Claude Chess

Hosts the chess games written by each model in `games/` behind one switcher, served from a single Cloudflare Worker with static assets.

## Layout

- `games/<model>_<version>-<subversion>/` one self-contained game per model. Drop in a new folder with the same naming format and it appears in the switcher on the next build. Each must be a Vite or Next.js project.
- `apps/shell/` the switcher page that loads the selected game in a frame at `/play/<slug>/`.
- `scripts/` discovers games, builds each under its own sub-path, and writes `dist/games.json`.

## Commands

```sh
npm install
npm --prefix apps/shell install
npm run build:games -- --skip-install   # local: reuse installed game dependencies
npm run build                           # games, then shell, into dist/
npm run dev                             # serve dist/ locally through wrangler
npm test                                # scripts tests; shell tests: npm --prefix apps/shell test
```

Cloudflare Workers Builds should use `npm ci && npm run build:ci` as the build command and `npx wrangler deploy` as the deploy command.

## Not built yet

Login, saved games, and the tip button are planned and not implemented.
