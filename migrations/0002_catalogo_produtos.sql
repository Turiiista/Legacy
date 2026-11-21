CREATE TABLE IF NOT EXISTS produtos (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE COLLATE NOCASE,
  preco_sem_parceria_centavos INTEGER NOT NULL DEFAULT 0 CHECK (preco_sem_parceria_centavos >= 0),
  preco_com_parceria_centavos INTEGER NOT NULL DEFAULT 0 CHECK (preco_com_parceria_centavos >= 0),
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  atualizado_em TEXT NOT NULL
);

INSERT INTO produtos (id, nome, preco_sem_parceria_centavos, preco_com_parceria_centavos, ativo, atualizado_em) VALUES
 ('legacy-cartao-i', 'Cartão de Ação Nível I', 1000000, 800000, 1, '2026-11-21T00:00:00.000Z'),
 ('legacy-cartao-ii', 'Cartão de Ação Nível II', 2000000, 1600000, 1, '2026-11-21T00:00:00.000Z'),
 ('legacy-cartao-iii', 'Cartão de Ação Nível III', 3000000, 2400000, 1, '2026-11-21T00:00:00.000Z'),
 ('legacy-capuz', 'Capuz', 1500000, 1200000, 1, '2026-11-21T00:00:00.000Z'),
 ('legacy-algema', 'Algemas', 1500000, 1200000, 1, '2026-11-21T00:00:00.000Z'),
 ('legacy-outros', 'Outros itens', 0, 0, 1, '2026-11-21T00:00:00.000Z')
ON CONFLICT(id) DO NOTHING;
