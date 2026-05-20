-- =============================================================================
-- Cinema das Guria — Schema completo (Supabase SQL Editor)
-- Execute este arquivo UMA vez. Apaga e recria users + acervo.
-- O login/senha ficam no Supabase Auth; esta tabela guarda perfil e acervo.
-- =============================================================================

DROP TABLE IF EXISTS acervo CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Perfil público (id = UUID do Supabase Auth → Authentication → Users)
CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL DEFAULT 'Usuário',
  email       TEXT NOT NULL UNIQUE,
  avatar      TEXT,
  bg_color    TEXT NOT NULL DEFAULT '#0a0a0c',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Vídeos salvos por usuário (acervo pessoal)
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

-- Mantém updated_at ao editar perfil
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

-- RLS DESLIGADO (recomendado para este app):
-- O navegador NÃO fala com o Supabase direto — só o Node no Render grava users/acervo.
-- Login/senha ficam no Auth; o backend usa SERVICE_ROLE_KEY e controla tudo.
-- No painel Supabase você pode: Table → users → desmarcar "Enable RLS" (mesmo efeito).
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE acervo DISABLE ROW LEVEL SECURITY;
