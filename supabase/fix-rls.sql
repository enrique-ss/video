-- Corrige erro de RLS no login (execute se users/acervo tiverem RLS ligado)

ALTER TABLE IF EXISTS users DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS acervo DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_select_own ON users;
DROP POLICY IF EXISTS users_insert_own ON users;
DROP POLICY IF EXISTS users_update_own ON users;
DROP POLICY IF EXISTS acervo_select_own ON acervo;
DROP POLICY IF EXISTS acervo_insert_own ON acervo;
DROP POLICY IF EXISTS acervo_update_own ON acervo;
DROP POLICY IF EXISTS acervo_delete_own ON acervo;
