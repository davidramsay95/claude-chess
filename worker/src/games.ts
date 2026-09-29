import { jsonResponse, problemResponse } from "./problem.ts";

export const MAX_BODY_BYTES = 256 * 1024;

const MODEL_SLUG_PATTERN = /^[a-z]+_\d+-\d+$/;
const ALLOWED_RESULTS = new Set(["1-0", "0-1", "1/2-1/2", "*"]);
const MAX_TITLE_LENGTH = 100;

interface GameRow {
  id: string;
  model_slug: string;
  title: string;
  result: string | null;
  state: string;
  created_at: string;
  updated_at: string;
}

interface NewGame {
  modelSlug: string;
  title: string;
  result: string | null;
  state: unknown;
}

const toSummary = (row: Omit<GameRow, "state">) => ({
  id: row.id,
  modelSlug: row.model_slug,
  title: row.title,
  result: row.result,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toGame = (row: GameRow) => ({ ...toSummary(row), state: JSON.parse(row.state) as unknown });

type Parsed = { ok: true; game: NewGame } | { ok: false; response: Response };

const parseNewGame = async (request: Request): Promise<Parsed> => {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  const text = await request.text();
  if (declaredLength > MAX_BODY_BYTES || text.length > MAX_BODY_BYTES) {
    return { ok: false, response: problemResponse(413, "Payload too large", `Limit is ${MAX_BODY_BYTES} bytes.`) };
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, response: problemResponse(400, "Invalid JSON", "Request body is not valid JSON.") };
  }
  if (typeof body !== "object" || body === null) {
    return { ok: false, response: problemResponse(400, "Invalid body", "Expected a JSON object.") };
  }

  const { modelSlug, title, result, state } = body as Record<string, unknown>;
  if (typeof modelSlug !== "string" || !MODEL_SLUG_PATTERN.test(modelSlug)) {
    return { ok: false, response: problemResponse(400, "Invalid modelSlug", "Expected model_version-subversion.") };
  }
  if (typeof title !== "string" || title.trim().length === 0 || title.length > MAX_TITLE_LENGTH) {
    return { ok: false, response: problemResponse(400, "Invalid title", `Expected 1 to ${MAX_TITLE_LENGTH} characters.`) };
  }
  if (result !== undefined && result !== null && (typeof result !== "string" || !ALLOWED_RESULTS.has(result))) {
    return { ok: false, response: problemResponse(400, "Invalid result", "Expected 1-0, 0-1, 1/2-1/2 or *.") };
  }
  if (state === undefined) {
    return { ok: false, response: problemResponse(400, "Missing state", "The game state is required.") };
  }

  return { ok: true, game: { modelSlug, title: title.trim(), result: (result as string | null | undefined) ?? null, state } };
};

export const createGame = async (db: D1Database, userId: string, request: Request): Promise<Response> => {
  const parsed = await parseNewGame(request);
  if (!parsed.ok) {
    return parsed.response;
  }
  const { game } = parsed;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .prepare(
      "INSERT INTO games (id, user_id, model_slug, title, result, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(id, userId, game.modelSlug, game.title, game.result, JSON.stringify(game.state), now, now)
    .run();

  return jsonResponse(
    { id, modelSlug: game.modelSlug, title: game.title, result: game.result, state: game.state, createdAt: now, updatedAt: now },
    201,
  );
};

export const listGames = async (db: D1Database, userId: string): Promise<Response> => {
  const { results } = await db
    .prepare(
      "SELECT id, model_slug, title, result, created_at, updated_at FROM games WHERE user_id = ? ORDER BY created_at DESC, rowid DESC",
    )
    .bind(userId)
    .all<Omit<GameRow, "state">>();
  return jsonResponse(results.map(toSummary));
};

export const getGame = async (db: D1Database, userId: string, id: string): Promise<Response> => {
  const row = await db.prepare("SELECT * FROM games WHERE id = ? AND user_id = ?").bind(id, userId).first<GameRow>();
  return row === null ? problemResponse(404, "Game not found") : jsonResponse(toGame(row));
};

export const deleteGame = async (db: D1Database, userId: string, id: string): Promise<Response> => {
  const result = await db.prepare("DELETE FROM games WHERE id = ? AND user_id = ?").bind(id, userId).run();
  return result.meta.changes === 0 ? problemResponse(404, "Game not found") : new Response(null, { status: 204 });
};
