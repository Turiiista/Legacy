# LEGACY — Painel financeiro compartilhado

Aplicação estática em HTML/CSS/JavaScript puro para a organização LEGACY da Cidade Brava. O Cloudflare Pages hospeda o site e suas funções de servidor; o Cloudflare D1 guarda o histórico comum. O login Discord confere os cargos autorizados. As operações são recalculadas e validadas no servidor; depois de gravadas, lavagens enviam embeds aos dois canais de lavagem e vendas ao canal de vendas.

## O que está incluído

- Dashboard, ranking de lavagens registradas por conta Discord, histórico geral, filtros, relatórios e CSV.
- As seis regras de lavagem e partilha 50/50 das vendas, calculadas no servidor em centavos inteiros.
- Sessão Discord, validação de cargo, API de operações D1 e webhooks privados.
- Exclusão individual de operações somente por gerente ou líder.
- Atualização dos dados a cada 30 segundos e quando o membro retorna à aba.
- Comprovante para impressão e backup JSON do histórico compartilhado.
- Catálogo de produtos editável, guardado localmente em cada navegador (o histórico financeiro, que é o registro principal, é compartilhado no D1).
- Imagens da identidade LEGACY locais em `assets/`, sem chamadas a fontes ou imagens externas.
- Testes automatizados das seis regras de lavagem, da divisão de vendas e dos valores inválidos.

## Estrutura

```text
index.html
style.css
script.js
_headers
README.md
assets/                 imagens LEGACY fornecidas
functions/_middleware.js
functions/_lib/auth.js
functions/_lib/operations.js
functions/api/auth/     login, callback e logout Discord
functions/api/session.js
functions/api/operations.js  leitura, gravação e exclusão no D1
migrations/0001_init.sql
 tests/calculations.test.mjs
```

## Publicação: passo a passo sem editar código

### 1. Enviar os arquivos ao GitHub

1. Baixe e descompacte o ZIP do projeto.
2. Crie um repositório no GitHub (pode ser privado).
3. Envie **o conteúdo inteiro** da pasta do projeto, incluindo `functions`, `assets`, `migrations` e `tests`. Na raiz do repositório devem aparecer `index.html`, `script.js`, `style.css` e as pastas citadas.
4. Não envie Client Secret, `SESSION_SECRET` nem URLs de webhook ao GitHub.

### 2. Criar/ligar o banco D1

1. No painel Cloudflare, abra **Workers & Pages → D1** (em algumas telas aparece em **Storage & Databases**).
2. Se já criou `legacy-db`, use esse banco. Caso não exista, crie um D1 com esse nome.
3. No D1, abra **Console** e execute o conteúdo de `migrations/0001_init.sql`. Ele usa `IF NOT EXISTS`; não apaga registros existentes. O código precisa das colunas `id`, `criado_em`, `tipo`, `discord_id`, `discord_nome`, `responsavel`, `valor_bruto_centavos`, `detalhes_json` e `observacao`.
4. Abra o projeto Pages em **Workers & Pages → seu projeto → Settings → Bindings**.
5. Adicione um vínculo **D1 database**: nome da variável **`DB`**, banco **`legacy-db`**, ambiente **Production**. Salve. Se testar em Preview, vincule o banco também nesse ambiente.

> O vínculo disponibiliza o D1 para o site; o projeto precisa estar atualizado no GitHub para gravar e consultar os registros.

### 3. Conectar o GitHub ao Cloudflare Pages

Se o projeto Pages já existe, confirme que está ligado ao repositório e que os novos arquivos chegaram à branch publicada. Se ainda não existe:

1. No Cloudflare, selecione **Workers & Pages → Create → Pages → Connect to Git** e conecte o GitHub.
2. Escolha o repositório e a branch principal.
3. Use **Framework preset: None**, deixe o **Build command** vazio e defina **Build output directory** como `.` (ponto), com a raiz do repositório contendo `index.html`.
4. Salve e aguarde o deploy. Os arquivos dentro de `functions/` são publicados como funções do Pages.

### 4. Criar os webhooks privados

No Discord, para cada canal: **Editar canal → Integrações → Webhooks → Novo webhook**. Crie um webhook em cada canal abaixo. Copie a URL completa, mas **não a envie aqui, não a coloque no GitHub e não a deixe em JavaScript**.

- Lavagens — canal `1573311237666902056`.
- Lavagens — canal `1573310826780295238`.
- Vendas — canal `1541769406596517919`.

### 5. Configurar variáveis e Secrets no Cloudflare

No Pages: **Settings → Variables and Secrets**. Cadastre em **Production**. Para cada item, crie uma variável com o nome exato. Marque credenciais e URLs de webhook como **Secret**; os IDs podem ser **Text**.

| Nome | Tipo | Valor |
|---|---|---|
| `DISCORD_CLIENT_ID` | Text | ID público do aplicativo Discord |
| `DISCORD_CLIENT_SECRET` | Secret | Novo Client Secret gerado no portal Discord |
| `DISCORD_GUILD_ID` | Text | `1541651937257328660` |
| `DISCORD_ALLOWED_ROLE_IDS` | Text | `1541651937286422617,1541651937299271722,1541651937311719490` |
| `SESSION_SECRET` | Secret | Segredo aleatório com ao menos 32 caracteres |
| `DISCORD_WASH_WEBHOOK_1` | Secret | URL do webhook do canal `1573311237666902056` |
| `DISCORD_WASH_WEBHOOK_2` | Secret | URL do webhook do canal `1573310826780295238` |
| `DISCORD_SALES_WEBHOOK` | Secret | URL do webhook do canal `1541769406596517919` |

IDs de cargos: membro `1541651937286422617`, gerente `1541651937299271722`, líder `1541651937311719490`. A detecção de permissões para exclusão usa os IDs gerente/líder informados; se os cargos forem recriados com IDs novos, atualize `DISCORD_MANAGER_ROLE_ID` e `DISCORD_LEADER_ROLE_ID` como variáveis **Text** no Cloudflare.

O Client Secret foi compartilhado em conversa anteriormente: **revogue-o e gere outro antes de colocar o site online**. Configure apenas o novo como Secret. Não compartilhe também o segredo de sessão ou URLs de webhook.

Para `SESSION_SECRET`, use um valor aleatório e exclusivo, com no mínimo 32 caracteres. Guarde-o em local seguro. Não use a senha do Discord.

### 6. Configurar o OAuth no Discord

1. Abra [Discord Developer Portal](https://discord.com/developers/applications), selecione o aplicativo LEGACY e vá a **OAuth2 → Redirects**.
2. Adicione exatamente `https://SEU-DOMINIO.pages.dev/api/auth/callback` (substitua pelo domínio real do projeto). Se usar domínio próprio, adicione também a URL dele.
3. Salve as variáveis do Cloudflare e faça um novo deploy.
4. Depois do deploy, saia e entre novamente com Discord para obter uma sessão atualizada com o cargo.

### 7. Testar o sistema publicado

1. Acesse o domínio Cloudflare. O site deve pedir login Discord.
2. Entre com usuário que tenha um dos três cargos. Uma conta sem esses cargos não acessa o painel.
3. No topo deve aparecer **Banco compartilhado**. Faça uma operação de teste legítima e confirme que aparece no histórico, no D1 e no(s) canal(is) Discord.
4. Peça a outro membro autorizado para abrir o site: ele deve ver a mesma operação após carregar, em até 30 segundos ou ao voltar para a aba.

## Como funcionam os registros e os logs

- O navegador envia somente os campos do formulário; o servidor identifica o membro pela sessão assinada, recalcula os valores e grava no D1.
- Após a confirmação do D1, o servidor publica uma embed no(s) webhook(s) pertinente(s). A embed mostra quem registrou, nome informado, valores, percentuais, data/hora, ID e observação.
- Se o Discord falhar, o registro permanece salvo. A tela avisará que o webhook falhou; confira a URL/Secret e o canal. Não registre de novo a mesma operação sem antes conferir o histórico, para evitar duplicidade.
- O ranking “Lavagens por membro” soma o valor bruto das lavagens registradas por cada conta Discord. Os dados do D1 podem ser exportados em CSV/JSON.
- Membros, gerentes e líderes veem o histórico geral. A exclusão individual é limitada a gerente/líder.
- Produtos personalizados ainda ficam no navegador onde foram cadastrados; cada membro pode manter seu próprio catálogo. As vendas registradas e seus totais são compartilhados.

## Testes de cálculo

Com Node.js 22 instalado, na pasta do projeto rode:

```sh
node --experimental-default-type=module --test tests/*.test.mjs
```

O teste valida as seis combinações financeiras, a divisão 50/50 (incluindo centavo ímpar) e a rejeição de valores inválidos.

## Segurança e limites

- Não há dados locais como base financeira: sem Cloudflare Pages Functions, sessão Discord e binding D1, os registros não serão salvos no compartilhado.
- O login é OAuth Discord com cookie assinado e `HttpOnly`; as rotas financeiras exigem sessão e origem do próprio site.
- O navegador nunca recebe Client Secret ou URL de webhook. Os webhooks podem publicar nos canais; regenere-os se forem expostos.
- A sessão dura até seis horas; a conferência de cargo ocorre no login. Saia e autentique novamente após mudança de cargo.
- O D1 armazena dados do servidor; configure acesso à conta Cloudflare e backups da própria Cloudflare com cuidado. O backup JSON do painel é baixado pelo usuário e contém o histórico financeiro.
- A conexão em tempo real é por atualização periódica, não por push instantâneo; novas operações aparecem em até 30 segundos ou ao atualizar a página.
