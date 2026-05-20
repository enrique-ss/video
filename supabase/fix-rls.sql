-- =============================================================================
-- CORREÇÃO: "new row violates row-level security policy for table users"
-- Cole no SQL Editor do Supabase e execute.
-- =============================================================================

-- Opção A (recomendada para este projeto): desliga RLS — o Node no Render grava com SERVICE_ROLE
ALTER TABLE IF EXISTS users DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS acervo DISABLE ROW LEVEL SECURITY;

-- Remove políticas antigas que possam conflitar
DROP POLICY IF EXISTS users_select_own ON users;
DROP POLICY IF EXISTS users_insert_own ON users;
DROP POLICY IF EXISTS users_update_own ON users;
DROP POLICY IF EXISTS acervo_select_own ON acervo;
DROP POLICY IF EXISTS acervo_insert_own ON acervo;
DROP POLICY IF EXISTS acervo_update_own ON acervo;
DROP POLICY IF EXISTS acervo_delete_own ON acervo;
