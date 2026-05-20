-- =============================================================================
-- Opção B: manter RLS ligado COM políticas (se NÃO usar SERVICE_ROLE_KEY no servidor)
-- Só use se souber que o backend envia o JWT do usuário nas gravações.
-- =============================================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE acervo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_select_own ON users;
DROP POLICY IF EXISTS users_insert_own ON users;
DROP POLICY IF EXISTS users_update_own ON users;
DROP POLICY IF EXISTS acervo_select_own ON acervo;
DROP POLICY IF EXISTS acervo_insert_own ON acervo;
DROP POLICY IF EXISTS acervo_delete_own ON acervo;

CREATE POLICY users_select_own ON users FOR SELECT
  USING (auth.uid()::text = id);

CREATE POLICY users_insert_own ON users FOR INSERT
  WITH CHECK (auth.uid()::text = id);

CREATE POLICY users_update_own ON users FOR UPDATE
  USING (auth.uid()::text = id);

CREATE POLICY acervo_select_own ON acervo FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY acervo_insert_own ON acervo FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY acervo_delete_own ON acervo FOR DELETE
  USING (auth.uid()::text = user_id);
