-- Cinema das Guria — schema Supabase (execute uma vez no SQL Editor)

DROP TABLE IF EXISTS acervo CASCADE;
DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL DEFAULT 'Usuário',
  email       TEXT NOT NULL UNIQUE,
  avatar      TEXT,
  bg_color    TEXT NOT NULL DEFAULT '#0a0a0c',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE acervo (
  id          BIGSERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  title       TEXT,
  thumbnail   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, url)
);

CREATE INDEX idx_acervo_user_id ON acervo(user_id);

CREATE OR REPLACE FUNCTION set_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION set_users_updated_at();

ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE acervo DISABLE ROW LEVEL SECURITY;
