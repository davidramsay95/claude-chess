import type { BetterAuthOptions } from "better-auth";
import { createHandler } from "./app.ts";
import { authenticateWithSession, createAuth } from "./auth.ts";
import { problemResponse } from "./problem.ts";

export interface AppOptions {
  /** Extra Better Auth options; used by tests to enable a sign-in method that needs no external provider. */
  authOptions?: Partial<BetterAuthOptions>;
}

/** Routes auth, games API and static asset requests. */
export const createApp = ({ authOptions = {} }: AppOptions = {}) => {
  const handleApi = createHandler({
    authenticate: (request, env) => authenticateWithSession(request, env, authOptions),
  });

  return async (request: Request, env: Cloudflare.Env): Promise<Response> => {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/api/auth/")) {
      return createAuth(env, authOptions).handler(request);
    }
    if (pathname.startsWith("/api/")) {
      return handleApi(request, env);
    }
    return env.ASSETS.fetch(request);
  };
};

const app = createApp();

export default {
  fetch: async (request: Request, env: Cloudflare.Env): Promise<Response> => {
    try {
      return await app(request, env);
    } catch (error) {
      console.error("Unhandled error", error);
      return problemResponse(500, "Internal server error");
    }
  },
} satisfies ExportedHandler<Cloudflare.Env>;
