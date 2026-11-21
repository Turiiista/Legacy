CREATE TABLE IF NOT EXISTS operacoes (
  id TEXT PRIMARY KEY,
  criado_em TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('wash', 'sale')),
  discord_id TEXT NOT NULL,
  discord_nome TEXT NOT NULL,
  responsavel TEXT NOT NULL,
  valor_bruto_centavos INTEGER NOT NULL CHECK (valor_bruto_centavos > 0),
  detalhes_json TEXT NOT NULL,
  observacao TEXT
);

CREATE INDEX IF NOT EXISTS idx_op_discord ON operacoes(discord_id);
CREATE INDEX IF NOT EXISTS idx_op_data ON operacoes(criado_em);
CREATE INDEX IF NOT EXISTS idx_op_tipo_data ON operacoes(tipo, criado_em);
