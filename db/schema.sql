-- Votação dos produtos dos aniversariantes do mês - Cervejaria Cidade Imperial
-- Script idempotente: pode ser executado várias vezes sem perder dados.
-- (As tabelas "itens" e "votos" da pesquisa de Natal, se existirem, não são usadas nem apagadas.)

CREATE TABLE IF NOT EXISTS produtos (
  id         SERIAL PRIMARY KEY,
  slug       TEXT        NOT NULL UNIQUE,
  categoria  TEXT        NOT NULL CHECK (categoria IN ('cerveja', 'energetico')),
  nome       TEXT        NOT NULL,
  detalhe    TEXT,
  imagem     TEXT,
  ordem      INTEGER     NOT NULL DEFAULT 0,
  ativo      BOOLEAN     NOT NULL DEFAULT TRUE,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Uma participação por matrícula: escolhe uma cerveja, um energético ou os dois.
CREATE TABLE IF NOT EXISTS participacoes (
  id            SERIAL PRIMARY KEY,
  matricula     TEXT        NOT NULL UNIQUE,
  cerveja_id    INTEGER     REFERENCES produtos (id),
  energetico_id INTEGER     REFERENCES produtos (id),
  ip            TEXT,
  user_agent    TEXT,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT participacoes_ao_menos_um CHECK (cerveja_id IS NOT NULL OR energetico_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS participacoes_cerveja_idx ON participacoes (cerveja_id);
CREATE INDEX IF NOT EXISTS participacoes_energetico_idx ON participacoes (energetico_id);
CREATE INDEX IF NOT EXISTS participacoes_criado_em_idx ON participacoes (criado_em);

-- Produtos em votação (atualiza textos/imagens se já existirem)
INSERT INTO produtos (slug, categoria, nome, detalhe, imagem, ordem) VALUES
  ('cerveja-gold',             'cerveja',    'Império Gold',          'Long neck · 330 ml',            '/img/cerveja-gold.webp',             1),
  ('cerveja-lager',            'cerveja',    'Império Lager',         'Long neck · 330 ml',            '/img/cerveja-lager.webp',            2),
  ('cerveja-helles',           'cerveja',    'Império Helles',        'Long neck · 330 ml',            '/img/cerveja-helles.webp',           3),
  ('cerveja-ultra',           'cerveja',    'Império Ultra',        'Long neck · 330 ml',            '/img/cerveja-ultra.webp',           4),
  ('energetico-extreme',       'energetico', 'Dopamina Extreme',      'Lata 269 ml · tutti-frutti',    '/img/energetico-extreme.webp',       1),
  ('energetico-black',         'energetico', 'Dopamina Black',        'Lata 473 ml · mix de frutas',   '/img/energetico-black.webp',         2),
  ('energetico-manga-summer',  'energetico', 'Dopamina Manga Summer', 'Tradicional · lata 473 ml · manga', '/img/energetico-manga-summer.webp', 3)
ON CONFLICT (slug) DO UPDATE SET
  categoria = EXCLUDED.categoria,
  nome      = EXCLUDED.nome,
  detalhe   = EXCLUDED.detalhe,
  imagem    = EXCLUDED.imagem,
  ordem     = EXCLUDED.ordem;
