# LEGACY — Painel financeiro da Cidade Brava

Aplicação estática em HTML, CSS e JavaScript puro, com funções Cloudflare Pages para login Discord e envio seguro de embeds aos canais. Os dados financeiros continuam no `localStorage` de cada navegador: não há sincronização de registros entre membros/dispositivos.

## Estrutura

```text
legacy-financeiro/
├── index.html
├── style.css
├── script.js
├── README.md
├── _headers
├── assets/
│   ├── coroa.png
│   ├── cruz.png
│   ├── leao.png
│   ├── legacy.png
│   └── lgc.png
└── functions/
    ├── _middleware.js
    ├── _lib/auth.js
    └── api/
        ├── session.js
        ├── auth/login.js
        ├── auth/callback.js
        ├── auth/logout.js
        └── discord/log.js
```

## Recursos

- Dashboard com totais, gráfico e filtro de período.
- Lavagens com prévia de divisão e as seis regras financeiras definidas pela LEGACY.
- Vendas de itens com partilha 50%/50% e catálogo editável.
- Histórico pesquisável, relatórios, CSV, comprovantes para impressão e backup JSON.
- Valores em centavos inteiros; ao digitar `1000000`, o campo mostra `R$ 1.000.000,00`. Para centavos, digite a vírgula e até dois algarismos. O sufixo visual `,00` não é texto obrigatório a digitar.
- Testes internos das seis regras de lavagem e da divisão de venda.
- Login Discord obrigatório no site publicado; o middleware Cloudflare protege as páginas e rotas, permitindo somente uma sessão emitida após validação de cargo de membro, gerente ou líder.
- Cada lavagem é enviada como embed aos dois canais de lavagem, e cada venda ao canal de vendas, quando os webhooks estiverem configurados.

## Testar localmente

Para visualizar o modo local, abra `index.html` no navegador ou sirva a pasta com um servidor estático local. Nesse modo os dados ficam apenas naquele navegador e o login/webhooks não funcionam. **Não use o modo local como publicação online com controle de acesso.** O modo publicado, com login obrigatório, depende das funções Cloudflare Pages e das variáveis de ambiente abaixo.

## Publicar pelo GitHub e Cloudflare Pages

### 1. Preparar o repositório GitHub

1. Crie um repositório no GitHub e envie para ele **todo o conteúdo desta pasta**, incluindo `functions/`, `assets/`, `_headers` e os arquivos HTML/CSS/JS. Não envie uma pasta incompleta.
2. O repositório pode ser privado. Não coloque segredos Discord, URLs de webhook, arquivos `.env` ou credenciais no GitHub.
3. Se o repositório contiver diretamente `index.html` e `functions/` na raiz, mantenha a raiz do projeto como `.` no Cloudflare. Se guardar o projeto dentro de uma subpasta, configure essa subpasta como diretório raiz do Pages.

### 2. Criar o projeto no Cloudflare Pages

1. Entre no painel da Cloudflare, abra **Workers & Pages → Create → Pages → Connect to Git** e autorize a conexão com o repositório GitHub.
2. Selecione o repositório e a branch principal.
3. Configure **Framework preset: None**, deixe o **Build command vazio** e defina o **Build output directory** como `.` (ou como a subpasta do projeto, se aplicável). Não há dependências nem compilação.
4. Salve e faça o primeiro deploy. Use o endereço `*.pages.dev` fornecido pela Cloudflare para os próximos passos.

### 3. Registrar o retorno OAuth no Discord

1. No [Discord Developer Portal](https://discord.com/developers/applications), abra a aplicação do bot LEGACY.
2. Em **OAuth2 → General**, copie o Client ID. Na seção de Client Secret, gere um **novo segredo** (veja o aviso de segurança abaixo) e guarde-o diretamente no Cloudflare, sem colá-lo no GitHub ou em mensagens.
3. Em **OAuth2 → Redirects**, adicione exatamente `https://SEU-PROJETO.pages.dev/api/auth/callback`, substituindo pelo domínio real. Depois de conectar um domínio próprio, adicione também a URL correspondente desse domínio.
4. O código solicita `identify` e `guilds.members.read`; a conta precisa ser membro do servidor LEGACY.

### 4. Criar os webhooks nos três canais

No Discord, em cada canal, acesse **Editar canal → Integrações → Webhooks → Novo webhook**. Copie a URL HTTPS privada. Crie um webhook em cada um destes canais:

- Lavagens — canal `1573311237666902056`.
- Lavagens — canal `1573310826780295238`.
- Vendas — canal `1541769406596517919`.

As lavagens serão enviadas aos dois canais indicados; vendas, ao canal de vendas. Os embeds incluem responsável, horário, operação, percentuais, valores e observações disponíveis.

**Não envie as URLs de webhook em mensagens, capturas de tela ou commits.** Configure-as diretamente como Secrets no Cloudflare. Uma URL vazada permite que terceiros publiquem no canal correspondente; se isso ocorrer, apague/recrie o webhook.

### 5. Adicionar variáveis privadas no Cloudflare

No projeto Pages, abra **Settings → Variables and Secrets** (ou a seção equivalente de variáveis de ambiente do projeto). Crie as variáveis abaixo para o ambiente **Production**; marque Client Secret, SESSION_SECRET e todas as URLs de webhook como **Secret**. Também configure Preview se quiser que os previews do Git exijam login.

| Nome | Valor |
|---|---|
| `DISCORD_CLIENT_ID` | `1521448913121574992` (ID público informado) |
| `DISCORD_CLIENT_SECRET` | Client Secret recém-gerado no portal (secreto) |
| `DISCORD_GUILD_ID` | ID do servidor LEGACY: `1541651937257328660` |
| `DISCORD_ALLOWED_ROLE_IDS` | IDs dos três cargos, separados por vírgula: `1541651937286422617,1541651937299271722,1541651937311719490` |
| `SESSION_SECRET` | Segredo aleatório único com pelo menos 32 caracteres |
| `DISCORD_WASH_WEBHOOK_1` | URL privada criada no canal `1573311237666902056` |
| `DISCORD_WASH_WEBHOOK_2` | URL privada criada no canal `1573310826780295238` |
| `DISCORD_SALES_WEBHOOK` | URL privada criada no canal `1541769406596517919` |

**IDs de cargos:** membro `1541651937286422617`; gerente `1541651937299271722`; líder `1541651937311719490`.

> A lista já usa os três IDs de cargo fornecidos: membro, gerente e líder. Separe-os por vírgulas, sem espaços extras. Não use os IDs dos canais nesta variável.

Para ativar o Modo Desenvolvedor do Discord: **Configurações → Avançado → Modo Desenvolvedor**. Depois clique com o botão direito no cargo e escolha **Copiar ID**.

Gere `SESSION_SECRET` com um gerador aleatório confiável ou gerenciador de senhas. Não reutilize senha de conta. Salve todas as variáveis e faça um novo deploy após atualizar configurações.

### 6. Conferir o acesso e os logs

1. Abra o domínio de produção. Sem sessão, a página redireciona para a autorização do Discord; o middleware não serve o painel até haver uma sessão válida.
2. Entre com uma conta que possua pelo menos um dos cargos de membro, gerente ou líder. Uma conta sem cargo permitido recebe acesso negado.
3. Registre uma operação de teste e confirme o embed nos canais corretos. Para teste, use uma operação de valor e dados apropriados à Cidade Brava; não há registros de exemplo pré-carregados.
4. Se o OAuth mostrar erro de redirect, confira se a URL cadastrada no Developer Portal é exatamente o domínio publicado seguido de `/api/auth/callback`.

A sessão tem validade máxima de seis horas; sair encerra o cookie. A autorização de cargo é verificada ao autenticar novamente.

## Segurança e limites

- **Credencial Discord compartilhada:** um Client Secret foi incluído em uma mensagem de chat. Trate-o como comprometido: revogue/regenere esse segredo no Discord Developer Portal e configure somente o novo valor como Secret no Cloudflare. Não reutilize o valor antigo.
- Nunca insira Client Secret, `SESSION_SECRET` ou URLs de webhook em `script.js`, HTML, commits, repositórios públicos ou mensagens.
- O OAuth e as chamadas de webhook ocorrem nas funções Cloudflare; o navegador não recebe esses segredos.
- O middleware do Cloudflare exige uma sessão assinada para servir as páginas publicadas; o login verifica um dos cargos autorizados. As sessões duram até seis horas e a autorização de cargo é verificada ao autenticar novamente.
- Cada navegador/dispositivo mantém sua própria cópia do `localStorage`. Para compartilhar saldo e histórico entre membros, é necessária uma etapa futura com backend e banco de dados.
- O Discord e a Cloudflare são necessários para login e publicação de logs; o painel em modo local não autentica usuários nem envia webhooks.
- Imagens recebidas foram adicionadas como arquivos locais em `assets/`; o site não depende de imagens remotas.
