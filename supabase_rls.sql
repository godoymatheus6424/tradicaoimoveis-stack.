-- ============================================================
-- TRADIÇÃO IMÓVEIS — Row-Level Security (RLS)
-- Execute este script no SQL Editor do painel Supabase
-- ============================================================

-- ============================================================
-- 1. ADMIN_USERS — zero acesso público (senhas protegidas)
-- ============================================================
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Nenhuma política pública: apenas service_role (backend) acessa


-- ============================================================
-- 2. CATEGORIAS — leitura pública, escrita só pelo backend
-- ============================================================
ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categorias_leitura_publica"
  ON categorias
  FOR SELECT
  TO anon, authenticated
  USING (true);


-- ============================================================
-- 3. IMOVEIS — leitura pública (só ativos), escrita pelo backend
-- ============================================================
ALTER TABLE imoveis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "imoveis_leitura_publica"
  ON imoveis
  FOR SELECT
  TO anon, authenticated
  USING (ativo = true);


-- ============================================================
-- 4. IMOVEL_FOTOS — leitura pública, escrita pelo backend
-- ============================================================
ALTER TABLE imovel_fotos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "imovel_fotos_leitura_publica"
  ON imovel_fotos
  FOR SELECT
  TO anon, authenticated
  USING (true);


-- ============================================================
-- 5. CONTATOS — inserção pública (formulário), leitura pelo backend
-- ============================================================
ALTER TABLE contatos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contatos_insercao_publica"
  ON contatos
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);


-- ============================================================
-- 6. CONDOMINIOS — leitura pública, escrita pelo backend
-- ============================================================
ALTER TABLE condominios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "condominios_leitura_publica"
  ON condominios
  FOR SELECT
  TO anon, authenticated
  USING (true);
