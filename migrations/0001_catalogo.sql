-- LEGACY: catálogo compartilhado com preço por parceria.
-- A tabela operacoes já existe no banco configurado; este script apenas cria o catálogo e seus produtos padrão.
CREATE TABLE IF NOT EXISTS produtos (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  preco_sem_parceria_centavos INTEGER NOT NULL DEFAULT 0 CHECK (preco_sem_parceria_centavos >= 0),
  preco_com_parceria_centavos INTEGER NOT NULL DEFAULT 0 CHECK (preco_com_parceria_centavos >= 0),
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_produtos_ativo_nome ON produtos(ativo, nome);
INSERT OR IGNORE INTO produtos (id,nome,preco_sem_parceria_centavos,preco_com_parceria_centavos,ativo,criado_em,atualizado_em) VALUES
('cartao-acao-nivel-i','Cartão de Ação Nível I',1000000,800000,1,datetime('now'),datetime('now')),
('cartao-acao-nivel-ii','Cartão de Ação Nível II',2000000,1600000,1,datetime('now'),datetime('now')),
('cartao-acao-nivel-iii','Cartão de Ação Nível III',3000000,2400000,1,datetime('now'),datetime('now')),
('capuz','Capuz',1500000,1200000,1,datetime('now'),datetime('now')),
('algemas','Algemas',1500000,1200000,1,datetime('now'),datetime('now')),
('outros-itens','Outros itens',0,0,1,datetime('now'),datetime('now'));
