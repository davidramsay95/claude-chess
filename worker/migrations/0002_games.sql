CREATE TABLE games (
  id TEXT NOT NULL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  model_slug TEXT NOT NULL,
  title TEXT NOT NULL,
  result TEXT,
  -- Opaque export from the game itself; each model's game defines its own format.
  state TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX games_user_created_idx ON games (user_id, created_at DESC);
