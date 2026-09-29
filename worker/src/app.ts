import { createGame, deleteGame, getGame, listGames } from "./games.ts";
import { problemResponse } from "./problem.ts";

export interface AuthenticatedUser {
  id: string;
}

export interface AppDependencies {
  /** Resolves the signed-in user for a request, or null when there is none. */
  authenticate: (request: Request, env: Cloudflare.Env) => Promise<AuthenticatedUser | null>;
}

const GAME_PATH = /^\/api\/games\/([0-9a-f-]{36})$/;

/** Builds the API request handler with its collaborators injected. */
export const createHandler =
  ({ authenticate }: AppDependencies) =>
  async (request: Request, env: Cloudflare.Env): Promise<Response> => {
    const { pathname } = new URL(request.url);
    const gameMatch = GAME_PATH.exec(pathname);
    const isGamesRoute = pathname === "/api/games" || gameMatch !== null;
    if (!isGamesRoute) {
      return problemResponse(404, "Not found");
    }

    const user = await authenticate(request, env);
    if (user === null) {
      return problemResponse(401, "Authentication required");
    }

    if (gameMatch === null) {
      if (request.method === "GET") return listGames(env.DB, user.id);
      if (request.method === "POST") return createGame(env.DB, user.id, request);
    } else {
      const id = gameMatch[1];
      if (request.method === "GET") return getGame(env.DB, user.id, id);
      if (request.method === "DELETE") return deleteGame(env.DB, user.id, id);
    }
    return problemResponse(405, "Method not allowed");
  };
