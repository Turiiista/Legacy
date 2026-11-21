# LEGACY — Painel financeiro compartilhado

Aplicação estática em HTML, CSS e JavaScript puro, com funções Cloudflare Pages, login Discord, banco compartilhado Cloudflare D1 e webhooks do Discord enviados pelo servidor. As operações não são guardadas em `localStorage`: todos os usuários autorizados consultam o mesmo histórico do D1.

## Estrutura

```text
LEGACY/
├── index.html
├── style.css
├── script.js
├── README.md
├── package.json
├── _headers
├── migrations/0001_catalogo.sql
├── tests/calculations.mjs
├── assets/                 # imagens locais da identidade LEGACY
└── functions/
    ├── _middleware.js
    ├── _lib/auth.js
    ├── _lib/operations.js
    └── api/
        ├── operacoes.js
        ├── operacoes/[id].js
        ├── produtos.js
        ├── produtos/[id].js
        ├── session.js
        ├── auth/...
        └── discord/log.js   # rota antiga desativada
```

## O que o painel faz

- Login Discord e autorização para membros, gerentes e líderes da LEGACY.
- Dashboard, histórico, relatórios e lavagens/Vendas lidos e gravados no mesmo D1.
- Seis regras originais de lavagem, calculadas novamente no servidor com centavos inteiros.
- Vendas com carrinho de até 25 linhas, parceria do comprador, preço unitário vindo do catálogo e partilha de 50% para vendedor e 50% para LEGACY.
- Tabela visual de preços com valores com e sem parceria, atualizada a partir do catálogo.
- Produtos e preços podem ser criados, editados ou removidos por gerentes e líderes. Exclusão de operações também é restrita a esses cargos.
- Relatório de comissões soma a parte dos vendedores nas vendas e as taxas/comissões dos lavadores.
- Histórico geral pesquisável, filtros de período, detalhes, impressão, CSV e exportação do backup JSON.
- Logs em embeds: lavagens para os canais `1573311237666902056` e `1573310826780295238`; vendas para `1541769406596517919`.
- Atualização periódica do histórico compartilhado para que os membros vejam novas operações sem depender do mesmo navegador.

## Antes do primeiro uso no D1

A tabela `operacoes` deve existir com as colunas já configuradas no seu banco: `id`, `criado_em`, `tipo`, `discord_id`, `discord_nome`, `responsavel`, `valor_bruto_centavos`, `detalhes_json` e `observacao`. O painel grava as operações nessa tabela.

O catálogo de itens usa uma tabela nova. No Cloudflare, abra o banco D1 `legacy-db` → **Console** e execute uma única vez o conteúdo completo de `migrations/0001_catalogo.sql`. Ele cria `produtos` e cadastra os preços iniciais:

| Produto | Sem parceria | Com parceria |
|---|---:|---:|
| Cartão de Ação Nível I | R$ 10.000,00 | R$ 8.000,00 |
| Cartão de Ação Nível II | R$ 20.000,00 | R$ 16.000,00 |
| Cartão de Ação Nível III | R$ 30.000,00 | R$ 24.000,00 |
| Capuz | R$ 15.000,00 | R$ 12.000,00 |
| Algemas | R$ 15.000,00 | R$ 12.000,00 |
| Outros itens | preço a cadastrar | preço a cadastrar |

Se a tabela `produtos` já existir, a criação e os índices usam `IF NOT EXISTS`, e `INSERT OR IGNORE` não duplica os produtos padrão.

## Publicar pelo GitHub e Cloudflare Pages

1. Descompacte o pacote e envie **todo o conteúdo da pasta** para a raiz do repositório GitHub: `functions/`, `assets/`, `migrations/`, `tests/`, HTML, CSS, JS, `_headers`, README e `package.json`.
2. No Cloudflare Pages conectado a esse repositório, configure **Framework preset: None**, comando de build vazio e diretório de saída `.`.
3. Em **Settings → Bindings**, vincule o banco D1 `legacy-db` com o nome de variável exatamente `DB`, no ambiente **Production**.
4. No Console do D1, execute o SQL da migração de catálogo descrito acima.
5. Em **Settings → Variables and Secrets**, configure em **Production** estes nomes exatamente. `Text` é texto simples; marque segredos e URLs como **Secret**:

   | Nome | Tipo | Valor |
   |---|---|---|
   | `DISCORD_CLIENT_ID` | Text | ID público do aplicativo Discord |
   | `DISCORD_CLIENT_SECRET` | Secret | Novo Client Secret gerado no Discord Developer Portal |
   | `DISCORD_GUILD_ID` | Text | `1541651937257328660` |
   | `DISCORD_ALLOWED_ROLE_IDS` | Text | `1541651937286422617,1541651937299271722,1541651937311719490` |
   | `SESSION_SECRET` | Secret | Segredo aleatório com pelo menos 32 caracteres |
   | `DISCORD_WASH_WEBHOOK_1` | Secret | URL do webhook no canal `1573311237666902056` |
   | `DISCORD_WASH_WEBHOOK_2` | Secret | URL do webhook no canal `1573310826780295238` |
   | `DISCORD_SALES_WEBHOOK` | Secret | URL do webhook no canal `1541769406596517919` |

   Não cole os valores secretos no GitHub nem em mensagens. Depois de salvar, faça um novo deploy.
6. Confira no Discord Developer Portal o endereço de retorno `https://SEU-DOMINIO/api/auth/callback`.
7. Faça novo deploy. Depois, saia do painel e entre novamente pelo Discord para receber uma sessão com os cargos e permissões atualizados.

As URLs dos webhooks, Client Secret e `SESSION_SECRET` nunca devem ir para o GitHub ou para o JavaScript. Se um webhook não estiver configurado ou o Discord estiver fora do ar, o painel ainda grava a operação no D1 e informa que o envio do log falhou; não registre de novo para evitar duplicidade.

## Cargos e permissões

O login aceita os cargos configurados por `DISCORD_ALLOWED_ROLE_IDS`. O catálogo e a exclusão de registros são reservados aos IDs de gerente e líder da LEGACY informados para esta instalação. Membros continuam podendo registrar operações. Como as funções validam a sessão no servidor, esconder um botão no navegador não é a única barreira de segurança.

## Testes e segurança

- Execute `npm test` para verificar as seis regras de lavagem e a divisão 50/50, incluindo centavos ímpares. Não são necessárias dependências adicionais.
- Não há login fictício: em produção, a página é protegida pelo middleware Cloudflare e exige sessão Discord válida.
- Gere um Client Secret novo caso o anterior tenha sido compartilhado. Cadastre somente o novo como Secret no Cloudflare.
- Este projeto não sincroniza dados usando `localStorage`. O banco D1 é a fonte de verdade compartilhada. Recomenda-se exportar backups CSV/JSON periodicamente.
- O D1 não substitui backups administrativos. A limpeza global do banco não é oferecida pelo painel para evitar apagamento acidental do histórico.

## Observação sobre artes da tabela de preços

A tabela foi montada como componentes responsivos com os preços informados e a identidade visual local do projeto. Se quiser usar literalmente os dois cartazes/imagens enviados no chat como banners, inclua esses arquivos separados no repositório e substitua os cartões visuais da aba; eles não estavam dentro do ZIP do projeto recebido.
