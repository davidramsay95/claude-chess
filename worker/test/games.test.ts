import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { createHandler, type AuthenticatedUser } from "../src/app.ts";

const insertUser = async (id: string): Promise<void> => {
  const now = new Date().toISOString();
  await env.DB.prepare(
    'INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(id, `User ${id}`, `${id}@example.com`, now, now)
    .run();
};

let currentUser: AuthenticatedUser | null = null;
const handler = createHandler({ authenticate: async () => currentUser });

const call = (path: string, init?: RequestInit): Promise<Response> =>
  handler(new Request(`https://chess.test${path}`, init), env);

const postGame = (body: unknown): Promise<Response> =>
  call("/api/games", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const validGame = { modelSlug: "opus_5-5", title: "Sicilian win", result: "1-0", state: { moves: ["e4", "c5"] } };

beforeEach(async () => {
  await env.DB.batch([env.DB.prepare("DELETE FROM games"), env.DB.prepare('DELETE FROM "user"')]);
  await insertUser("alice");
  await insertUser("bob");
  currentUser = { id: "alice" };
});

describe("authentication boundary", () => {
  it("rejects unauthenticated requests with a 401 problem document", async () => {
    currentUser = null;
    const response = await call("/api/games");
    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    expect(await response.json()).toMatchObject({ status: 401 });
  });
});

describe("POST /api/games", () => {
  it("saves a game and returns it with an id", async () => {
    const response = await postGame(validGame);
    expect(response.status).toBe(201);
    const saved = (await response.json()) as { id: string; modelSlug: string; state: unknown };
    expect(saved.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(saved.modelSlug).toBe("opus_5-5");
    expect(saved.state).toEqual(validGame.state);
  });

  it.each([
    ["a missing title", { ...validGame, title: "" }],
    ["a model slug that is not in the models format", { ...validGame, modelSlug: "../etc" }],
    ["a missing state", { modelSlug: "opus_5-5", title: "x" }],
  ])("rejects %s with a 400 problem document", async (_name, body) => {
    const response = await postGame(body);
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
  });

  it("rejects a body that is not valid JSON with a 400", async () => {
    const response = await call("/api/games", { method: "POST", body: "{nope" });
    expect(response.status).toBe(400);
  });

  it("rejects a state larger than the limit with a 413", async () => {
    const response = await postGame({ ...validGame, state: { blob: "x".repeat(300_000) } });
    expect(response.status).toBe(413);
  });
});

describe("GET /api/games", () => {
  it("lists only the caller's games, newest first, without the state", async () => {
    await postGame({ ...validGame, title: "first" });
    await postGame({ ...validGame, title: "second" });
    currentUser = { id: "bob" };
    await postGame({ ...validGame, title: "bobs" });
    currentUser = { id: "alice" };

    const response = await call("/api/games");
    const games = (await response.json()) as Array<Record<string, unknown>>;
    expect(games.map((game) => game.title)).toEqual(["second", "first"]);
    expect(games[0]).not.toHaveProperty("state");
  });
});

describe("GET /api/games/:id", () => {
  it("returns the full game including state", async () => {
    const created = (await (await postGame(validGame)).json()) as { id: string };
    const response = await call(`/api/games/${created.id}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: created.id, state: validGame.state });
  });

  it("returns 404 for another user's game rather than revealing it exists", async () => {
    const created = (await (await postGame(validGame)).json()) as { id: string };
    currentUser = { id: "bob" };
    expect((await call(`/api/games/${created.id}`)).status).toBe(404);
  });
});

describe("DELETE /api/games/:id", () => {
  it("deletes the caller's game", async () => {
    const created = (await (await postGame(validGame)).json()) as { id: string };
    expect((await call(`/api/games/${created.id}`, { method: "DELETE" })).status).toBe(204);
    expect((await call(`/api/games/${created.id}`)).status).toBe(404);
  });

  it("does not delete another user's game", async () => {
    const created = (await (await postGame(validGame)).json()) as { id: string };
    currentUser = { id: "bob" };
    expect((await call(`/api/games/${created.id}`, { method: "DELETE" })).status).toBe(404);
    currentUser = { id: "alice" };
    expect((await call(`/api/games/${created.id}`)).status).toBe(200);
  });
});

describe("routing", () => {
  it("answers unknown API paths with a 404 problem document", async () => {
    const response = await call("/api/nope");
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
  });

  it("answers unsupported methods with a 405", async () => {
    expect((await call("/api/games", { method: "PUT" })).status).toBe(405);
  });
});
