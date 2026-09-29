import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/index.ts";

// Email and password sign-up is enabled here only to obtain a real session cookie without a live OAuth provider.
const app = createApp({ authOptions: { emailAndPassword: { enabled: true } } });

const call = (path: string, init?: RequestInit): Promise<Response> =>
  app(new Request(`https://chess.test${path}`, init), env);

const signUp = async (email: string): Promise<string> => {
  const response = await call("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://chess.test" },
    body: JSON.stringify({ email, password: "correct-horse-battery", name: "Test Player" }),
  });
  expect(response.status).toBe(200);
  const cookie = response.headers.getSetCookie().map((header) => header.split(";")[0]).join("; ");
  expect(cookie).toContain("session_token");
  return cookie;
};

const saveGame = (cookie: string): Promise<Response> =>
  call("/api/games", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ modelSlug: "opus_5-5", title: "Cookie game", state: { moves: [] } }),
  });

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM games"),
    env.DB.prepare('DELETE FROM "session"'),
    env.DB.prepare('DELETE FROM "account"'),
    env.DB.prepare('DELETE FROM "user"'),
  ]);
});

describe("session authentication", () => {
  it("rejects the games API without a session cookie", async () => {
    expect((await call("/api/games")).status).toBe(401);
  });

  it("accepts a session created by Better Auth and scopes games to that user", async () => {
    const cookie = await signUp("alice@example.com");
    expect((await saveGame(cookie)).status).toBe(201);

    const list = (await (await call("/api/games", { headers: { cookie } })).json()) as unknown[];
    expect(list).toHaveLength(1);

    const otherCookie = await signUp("bob@example.com");
    const otherList = (await (await call("/api/games", { headers: { cookie: otherCookie } })).json()) as unknown[];
    expect(otherList).toHaveLength(0);
  });

  it("rejects a forged session cookie", async () => {
    const response = await call("/api/games", { headers: { cookie: "better-auth.session_token=forged.value" } });
    expect(response.status).toBe(401);
  });
});

describe("static assets", () => {
  it("passes non-API requests through to the assets binding", async () => {
    const assets = { fetch: async () => new Response("asset body") } as unknown as Fetcher;
    const response = await app(new Request("https://chess.test/play/x/"), { ...env, ASSETS: assets });
    expect(await response.text()).toBe("asset body");
  });
});
