import { betterAuth, type BetterAuthOptions } from "better-auth";
import type { AuthenticatedUser } from "./app.ts";

/**
 * Builds the Better Auth instance for a request's environment.
 * Social providers are only enabled when their credentials are configured,
 * so the app still runs before the OAuth apps exist.
 */
export const createAuth = (env: Cloudflare.Env, extraOptions: Partial<BetterAuthOptions> = {}) => {
  const socialProviders: BetterAuthOptions["socialProviders"] = {};
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    socialProviders.google = { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
  }
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    socialProviders.github = { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET };
  }

  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    socialProviders,
    ...extraOptions,
  });
};

/** Resolves the signed-in user from the request's session cookie, or null. */
export const authenticateWithSession = async (
  request: Request,
  env: Cloudflare.Env,
  extraOptions: Partial<BetterAuthOptions> = {},
): Promise<AuthenticatedUser | null> => {
  const session = await createAuth(env, extraOptions).api.getSession({ headers: request.headers });
  return session === null ? null : { id: session.user.id };
};
