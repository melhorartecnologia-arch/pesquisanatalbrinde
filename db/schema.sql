-- Pesquisa da Cesta de Natal - Cervejaria Cidade Imperial
-- Script idempotente: pode ser executado várias vezes sem perder dados.

CREATE TABLE IF NOT EXISTS itens (
  id          SERIAL PRIMARY KEY,
  slug        TEXT        NOT NULL UNIQUE,
  nome        TEXT        NOT NULL,
  descricao   TEXT,
  imagem      TEXT,
  ordem       INTEGER     NOT NULL DEFAULT 0,
  ativo       BOOLEAN     NOT NULL DEFAULT TRUE,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS votos (
  id             SERIAL PRIMARY KEY,
  item_id        INTEGER     NOT NULL REFERENCES itens (id),
  nome           TEXT,
  setor          TEXT,
  dispositivo_id UUID,
  ip             TEXT,
  user_agent     TEXT,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Votação livre (sem nome/setor e sem trava por navegador).
-- Ajusta bancos criados pela versão anterior, preservando os votos existentes.
ALTER TABLE votos ALTER COLUMN nome DROP NOT NULL;
ALTER TABLE votos ALTER COLUMN dispositivo_id DROP NOT NULL;
ALTER TABLE votos DROP CONSTRAINT IF EXISTS votos_dispositivo_id_key;

CREATE INDEX IF NOT EXISTS votos_item_id_idx ON votos (item_id);
CREATE INDEX IF NOT EXISTS votos_criado_em_idx ON votos (criado_em);

-- Itens da cesta (atualiza textos/imagens se já existirem)
INSERT INTO itens (slug, nome, descricao, imagem, ordem) VALUES
  (
    'cooler-ultra-00',
    'Cooler Império Ultra 0.0',
    'Cooler térmico cilíndrico com alça regulável a tiracolo. Leve, prático e perfeito para levar a gelada sem álcool e sem glúten para qualquer lugar.',
    '/img/cooler-ultra-00.webp',
    1
  ),
  (
    'caixa-termica-00',
    'Caixa Térmica Império 0.0',
    'Caixa térmica verde com tampa, espaço de sobra para as latinhas e o gelo. Ideal para o churrasco, a praia e as confraternizações.',
    '/img/caixa-termica-00.webp',
    2
  )
ON CONFLICT (slug) DO UPDATE SET
  nome      = EXCLUDED.nome,
  descricao = EXCLUDED.descricao,
  imagem    = EXCLUDED.imagem,
  ordem     = EXCLUDED.ordem;
