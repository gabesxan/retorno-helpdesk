<div align="center">

# RETORNO

**Do primeiro relato à resolução, com contexto em cada etapa.**

Help desk para equipes de suporte a sistemas de automação comercial.

![Versão 1.0.0](https://img.shields.io/badge/vers%C3%A3o-1.0.0-7942DC?style=flat-square)
![React e TypeScript](https://img.shields.io/badge/frontend-React%20%2B%20TypeScript-111111?style=flat-square)
![Fastify e MySQL](https://img.shields.io/badge/backend-Fastify%20%2B%20MySQL-111111?style=flat-square)
![Revisão humana](https://img.shields.io/badge/IA-revis%C3%A3o%20humana-DEFF57?style=flat-square&labelColor=111111)

[Visão geral](#o-projeto) · [Fluxograma](#do-chamado-à-resolução) · [Executar](#executar-localmente) · [Segurança](#segurança-e-permissões) · [Verificações](#verificações) · [Limitações](#limitações-da-v1)

</div>

![Fila de atendimento do RETORNO em desktop](docs/evidencias/02-fila-desktop.png)

## O projeto

Uma impressora parou no caixa. O estoque diverge do relatório. Um operador perdeu acesso ao sistema. O **RETORNO** organiza esse atendimento em uma fila, reunindo conversa, responsável, prioridade, documentação e histórico no mesmo lugar.

A aplicação atende uma única organização com três perfis: **solicitante**, **atendente** e **administrador**. A assistência por IA sugere classificação e prepara respostas com referências da base de conhecimento; a equipe revisa e decide o que aplicar ou enviar.

**Estado da entrega:** v1 para demonstração local e estudo. As capturas utilizam dados fictícios. A integração com Gemini existe no backend, mas chamadas reais ao provedor não foram validadas nesta publicação; os testes exercitam um gateway controlado e a simulação local identificada.

## O que a v1 entrega

| Área             | Comportamento implementado                                                                                |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| Atendimento      | Abertura, busca, filtros, paginação, prioridade, categoria e atribuição de responsável.                   |
| Conversa         | Respostas públicas e notas internas separadas, com histórico de autoria e horários.                       |
| Continuidade     | Rascunhos por usuário, chamado e visibilidade; preservação durante navegação e recarga.                   |
| Ciclo do chamado | Em aberto, em atendimento, aguardando cliente, resolução e reabertura.                                    |
| Conhecimento     | Artigos Markdown, busca MySQL FULLTEXT e gestão de publicação pelo administrador.                         |
| IA assistida     | Sugestão de classificação, rascunho com fontes, indicação de documentação insuficiente e revisão humana.  |
| Administração    | Cadastro, edição, ativação e desativação de usuários; proteção do último administrador ativo.             |
| Consistência     | Versionamento otimista nas alterações de chamado e chave de idempotência no envio de mensagens.           |
| Interface        | Desktop com fila e detalhe; navegação mobile entre lista e chamado; fontes servidas pelo próprio projeto. |

## Do chamado à resolução

![Fluxograma do atendimento: entrada, investigação, assistência opcional e resolução](docs/diagrams/atendimento.svg)

[Abrir fluxograma em tamanho integral](docs/diagrams/atendimento.svg) · [Fonte editável em Mermaid](docs/diagrams/atendimento.mmd)

A assistência é opcional. Se faltar documentação ou o provedor estiver indisponível, a equipe continua o atendimento manual. As sugestões nunca são enviadas automaticamente ao cliente.

<details>
<summary><strong>Estados do chamado</strong></summary>

```mermaid
stateDiagram-v2
    direction LR
    state "Em aberto" as OPEN
    state "Em atendimento" as IN_PROGRESS
    state "Aguardando cliente" as WAITING
    state "Resolvido" as RESOLVED
    [*] --> OPEN: abertura
    OPEN --> IN_PROGRESS: início do atendimento
    IN_PROGRESS --> WAITING: aguarda retorno
    WAITING --> IN_PROGRESS: continuação
    OPEN --> RESOLVED: resolução
    IN_PROGRESS --> RESOLVED: resolução
    WAITING --> RESOLVED: resolução
    RESOLVED --> OPEN: reabertura
```

O diagrama apresenta o percurso de uso. As ações disponíveis dependem do perfil e das regras dos endpoints; alterações concorrentes são verificadas pela versão do chamado.

</details>

## Arquitetura

```mermaid
flowchart LR
    WEB["React + TypeScript<br/>Fila · conversa · artigos"]
    PROXY["Proxy /api<br/>Vite no desenvolvimento"]
    API["Fastify<br/>Sessão · CSRF · RBAC · Zod"]
    DB[("MySQL 8.4<br/>Prisma · FULLTEXT")]
    AI["Serviço de assistência<br/>Contexto limitado · validação"]
    GEM["Gemini API<br/>Somente no backend"]
    WEB --> PROXY --> API
    API --> DB
    API --> AI
    AI --> DB
    AI -. "com chave configurada" .-> GEM
    classDef web fill:#F3EEFD,stroke:#7942DC,color:#211535,stroke-width:2px;
    classDef core fill:#111111,stroke:#111111,color:#FFFFFF,stroke-width:2px;
    classDef data fill:#F5F5F0,stroke:#9A9A93,color:#111111;
    classDef assist fill:#EDFFAB,stroke:#8AA632,color:#26310D;
    class WEB,PROXY web;
    class API core;
    class DB data;
    class AI,GEM assist;
```

| Camada       | Tecnologias e responsabilidade                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| Frontend     | React 19, TypeScript, Vite e React Router 7; CSS próprio; Barlow Condensed, IBM Plex Sans e JetBrains Mono.        |
| API          | Node.js, Fastify 5 e Zod 4; autenticação, autorização e regras de atendimento.                                     |
| Persistência | Prisma 6.19.3 e MySQL 8.4; migrations, relações, transações e índices FULLTEXT.                                    |
| Assistência  | SDK `@google/genai`; recuperação de artigos, validação estruturada e referências restritas ao contexto recuperado. |
| Verificação  | Node test runner, Vitest, Testing Library, Playwright, ESLint e Prettier.                                          |

### Organização do código

```text
.
├── apps/
│   ├── api/
│   │   ├── prisma/          # Schema, migration inicial e seed
│   │   ├── src/
│   │   │   ├── config/     # Validação das variáveis de ambiente
│   │   │   ├── lib/        # Senhas, sessões, erros e sanitização
│   │   │   ├── modules/    # Auth, users, tickets, kb e ai
│   │   │   └── plugins/    # Segurança HTTP e autenticação
│   │   └── test/           # Integração com MySQL e casos de abuso
│   └── web/
│       └── src/            # Páginas, componentes, contexto e estilos
├── docs/
│   ├── diagrams/           # Fluxograma SVG e fonte Mermaid
│   ├── evidencias/         # Capturas da aplicação
│   ├── MATRIZ_PERMISSOES.md
│   ├── RELATORIO_SEGURANCA.md
│   └── VALIDACAO_V1.md
├── e2e/                    # Cenários Playwright desktop e mobile
├── scripts/                # MySQL local e scanner de segredos
└── docker-compose.yml      # Bancos separados de desenvolvimento e teste
```

## Executar localmente

### 1. Pré-requisitos e dependências

- Node.js **22.12+** ou uma versão LTS mais recente compatível com as dependências. Esta publicação foi verificada em Node **26.13.0**.
- npm com suporte a workspaces.
- MySQL 8.4: pelo Docker Compose ou pelo inicializador local incluído.

```bash
git clone https://github.com/gabesxan/retorno-helpdesk.git
cd retorno-helpdesk
npm ci
cp .env.example .env
DATABASE_URL="mysql://retorno_app:retorno_dev_local_pass@127.0.0.1:33306/retorno_dev" \
  npm --workspace @retorno/api run prisma:generate
```

### 2. Configurar o ambiente

Para usar os bancos locais definidos no Compose ou no inicializador, ajuste estas linhas do `.env`:

```dotenv
DATABASE_URL="mysql://retorno_app:retorno_dev_local_pass@127.0.0.1:33306/retorno_dev"
TEST_DATABASE_URL="mysql://retorno_test:retorno_test_local_pass@127.0.0.1:33307/retorno_test"
SEED_CONFIRM_ISOLATED_DB=true
AI_ALLOW_SIMULATED_FALLBACK=true
```

Essas senhas são exclusivas dos bancos fictícios de desenvolvimento. Os placeholders de `.env.example` precisam ser substituídos; copiar o arquivo sem esse ajuste não conecta aos serviços fornecidos.

### 3. Iniciar o MySQL

Escolha **uma** alternativa:

```bash
# Com Docker: inicia os dois bancos definidos no Compose.
docker compose up -d
```

Ou, em outro terminal:

```bash
# Sem Docker: baixa/inicia MySQL local e permanece em primeiro plano.
npm run db:start
```

O inicializador depende de um binário compatível com o sistema e de rede no primeiro download. `Ctrl+C` encerra as instâncias que ele iniciou. Seu armazenamento é temporário; para desenvolvimento persistente, prefira o volume do Compose.

```bash
npm run db:ensure
```

| Serviço                  | Endereço local          | Banco          |
| ------------------------ | ----------------------- | -------------- |
| MySQL de desenvolvimento | `127.0.0.1:33306`       | `retorno_dev`  |
| MySQL de testes          | `127.0.0.1:33307`       | `retorno_test` |
| API                      | `http://127.0.0.1:3340` | —              |
| Interface                | `http://127.0.0.1:4178` | —              |

### 4. Aplicar migrations e carregar a demonstração

```bash
DATABASE_URL="mysql://retorno_app:retorno_dev_local_pass@127.0.0.1:33306/retorno_dev" \
  npm run db:migrate
npm run db:seed
```

> **O seed apaga e recria os dados do banco de destino.** Execute apenas em um banco local descartável deste projeto. O comando exige confirmação explícita, rejeita produção e verifica host local e prefixo `retorno_`; essas verificações não substituem conferir a URL configurada.

São criados 18 chamados, 7 artigos, usuários e conversas fictícias. Os comandos Prisma recebem a URL explicitamente porque são executados no workspace da API e não carregam o `.env` da raiz automaticamente; o servidor e o seed possuem seu próprio carregamento do ambiente.

### 5. Iniciar a aplicação

Terminal da API:

```bash
npm run dev:api
```

Terminal da interface:

```bash
npm run dev:web
```

Abra [a interface local](http://127.0.0.1:4178). A [rota de saúde](http://127.0.0.1:3340/api/health) também verifica a conexão da API com o banco.

### Contas da demonstração

| Perfil        | E-mail                           | Senha fictícia    |
| ------------- | -------------------------------- | ----------------- |
| Administrador | `helena.moraes@retorno.local`    | `Retorno!Dev2026` |
| Atendente     | `lucas.almeida@retorno.local`    | `Retorno!Dev2026` |
| Atendente     | `bianca.souza@retorno.local`     | `Retorno!Dev2026` |
| Solicitante   | `compras@mercadobompreco.local`  | `Cliente!Dev2026` |
| Solicitante   | `gerencia@farmaciacentral.local` | `Cliente!Dev2026` |
| Solicitante   | `caixa@padariaaurora.local`      | `Cliente!Dev2026` |

## Roteiro para conhecer o produto

1. Entre como **solicitante**, abra um chamado e consulte seu histórico.
2. Entre como **atendente**, localize o chamado, atribua responsável e registre uma nota interna.
3. Abra **Contexto & IA**, solicite uma classificação e prepare uma resposta. Consulte as fontes antes de aproveitar o texto.
4. Procure `RET-0018` para observar o caso sem documentação suficiente.
5. Envie uma resposta pública manualmente; resolva e reabra um chamado.
6. Volte ao solicitante e confira que a resposta é visível e a nota interna permanece restrita à equipe.
7. Entre como **administrador** para consultar usuários e gerenciar artigos.

## Assistência por IA

| Ação                     | Resultado                                      | Quem decide                        |
| ------------------------ | ---------------------------------------------- | ---------------------------------- |
| Sugerir classificação    | Categoria, prioridade e justificativa.         | O atendente aplica explicitamente. |
| Preparar resposta        | Rascunho e referências de artigos consultados. | O atendente revisa, edita e envia. |
| Sem cobertura documental | Limitação e pergunta sugerida ao cliente.      | A equipe conduz a investigação.    |
| Serviço indisponível     | Erro identificado sem bloquear a conversa.     | O atendimento manual continua.     |

Para chamar o provedor, configure `GEMINI_API_KEY` e `GEMINI_MODEL` no `.env`. A chave pertence somente ao backend. Confirme a disponibilidade do modelo escolhido na sua conta; há custos e limites próprios da API.

Sem chave, a simulação só funciona em desenvolvimento/teste quando `AI_ALLOW_SIMULATED_FALLBACK=true`. A interface identifica o modo. Em produção a simulação é desabilitada e a ausência do provedor retorna indisponibilidade.

Notas internas ficam fora do contexto por padrão. Incluí-las exige ação explícita e justificativa. A saída é validada, as referências são limitadas aos artigos recuperados e mudanças de versão do chamado durante a geração são sinalizadas. Essas medidas não garantem a correção factual de toda resposta gerada.

## Segurança e permissões

| Operação                            | Solicitante     | Atendente  | Administrador |
| ----------------------------------- | --------------- | ---------- | ------------- |
| Abrir e acompanhar chamados         | Apenas próprios | Todos      | Todos         |
| Resposta pública                    | Apenas próprios | Sim        | Sim           |
| Nota interna                        | Não             | Sim        | Sim           |
| Categoria, prioridade e responsável | Não             | Sim        | Sim           |
| Resolver e reabrir                  | Apenas próprios | Sim        | Sim           |
| Consultar artigos                   | Não             | Publicados | Todos         |
| Criar e editar artigos              | Não             | Não        | Sim           |
| Usar assistência                    | Não             | Sim        | Sim           |
| Gerenciar usuários                  | Não             | Não        | Sim           |

Controles implementados incluem hash de senha com `scrypt`, sessão opaca em cookie `HttpOnly`, hash do token no banco, revogação no servidor, validação de origem e CSRF, limites de login e IA, validação Zod, consultas parametrizadas e sanitização de Markdown.

[Matriz completa de permissões e fronteiras de confiança](docs/MATRIZ_PERMISSOES.md) · [Relatório de segurança do desenvolvimento](docs/RELATORIO_SEGURANCA.md) · [Verificação desta publicação](docs/VALIDACAO_V1.md)

## Verificações

Na preparação desta publicação foram executados com sucesso:

- **18 testes de backend** com MySQL real isolado, em 5 suítes.
- **4 testes de frontend** em 2 arquivos.
- Lint, typecheck, build e scanner de segredos.

As suítes incluem IDOR, notas internas, revogação de sessão, CSRF, limites da IA, referências inválidas, concorrência e envio repetido de mensagens.

| Comando                    | Finalidade                                          |
| -------------------------- | --------------------------------------------------- |
| `npm run lint`             | Análise estática.                                   |
| `npm run format:check`     | Formatação.                                         |
| `npm run typecheck`        | Tipos da API e interface.                           |
| `npm run build`            | Builds de produção.                                 |
| `npm run test:backend`     | Integração; recria fixtures em `retorno_test`.      |
| `npm run test:frontend`    | Componentes e sanitização.                          |
| `npm run test:e2e`         | Fluxos Playwright desktop e mobile.                 |
| `npm run security:secrets` | Scanner local de padrões de segredos.               |
| `npm run security:audit`   | Auditoria de dependências; possui pendências na v1. |

Antes dos testes de backend, aplique a migration no banco de testes:

```bash
DATABASE_URL="mysql://retorno_test:retorno_test_local_pass@127.0.0.1:33307/retorno_test" \
  npm --workspace @retorno/api run prisma:deploy
npm run test:backend
```

Para Playwright, instale o Chromium com `npx playwright install chromium`, gere o build e prepare uma demonstração local descartável. A configuração usa as portas de desenvolvimento e pode reutilizar servidores existentes; os cenários alteram os chamados. As capturas incluídas vieram do ciclo anterior; os E2E não foram reexecutados nesta publicação.

## Interface em detalhes

| Resposta assistida com fontes                                                    | Ausência de documentação                                                      |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| ![Contexto e assistência por IA](docs/evidencias/03-chamado-nota-interna-ia.png) | ![Limitação documental identificada](docs/evidencias/04-sem-documentacao.png) |

<details>
<summary><strong>Mobile, login e base de conhecimento</strong></summary>

| Fila mobile                                             | Detalhe mobile                                                |
| ------------------------------------------------------- | ------------------------------------------------------------- |
| ![Fila no celular](docs/evidencias/06-mobile-lista.png) | ![Conversa no celular](docs/evidencias/07-mobile-detalhe.png) |

![Tela de login](docs/evidencias/01-login.png)

![Pesquisa na base de conhecimento](docs/evidencias/05-base-conhecimento.png)

</details>

## API: mapa de entrada

| Grupo        | Endpoints principais                                                                        |
| ------------ | ------------------------------------------------------------------------------------------- |
| Sessão       | `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`                         |
| Chamados     | `GET/POST /api/tickets`, `GET/PATCH /api/tickets/:id`                                       |
| Conversa     | `POST /api/tickets/:id/messages`                                                            |
| Ciclo        | `POST /api/tickets/:id/resolve`, `POST /api/tickets/:id/reopen`                             |
| Rascunhos    | `PUT/DELETE /api/tickets/:id/drafts`                                                        |
| Conhecimento | `GET/POST /api/kb/articles`, `GET /api/kb/articles/:slugOrId`, `PATCH /api/kb/articles/:id` |
| Equipe       | `GET /api/agents`, `GET /api/requesters`, `GET/POST /api/users`, `PATCH /api/users/:id`     |
| IA           | `POST /api/tickets/:id/ai/classify`, `POST /api/tickets/:id/ai/draft-reply`                 |

Mutações autenticadas exigem cookie, origem permitida e `X-CSRF-Token`. Atualizações sujeitas a concorrência usam `expectedVersion`; mensagens podem receber `idempotencyKey`. Consulte os schemas em [apps/api/src/modules](apps/api/src/modules) para os contratos exatos.

## Limitações da v1

- Uma organização; sem WhatsApp, e-mail, anexos, pagamentos ou multitenancy.
- Não há serviço público hospedado nesta entrega. O repositório contém o código e a demonstração local.
- A chamada real ao Gemini e um deploy em produção continuam pendentes de validação.
- A auditoria completa retornou **14 ocorrências altas**, propagadas por duas causas transitivas: `deepmerge-ts` e `picomatch`. Com `--omit=dev`, ainda há **3 ocorrências altas** na cadeia do CLI Prisma. A v1 não tem auditoria sem alertas.
- Rate limiting e controle de concorrência da IA ficam na memória de um processo. Escala horizontal exige coordenação compartilhada.
- O Compose inicia os bancos, não empacota toda a aplicação. HTTPS, proxy, fallback da SPA e cabeçalhos do frontend precisam ser configurados no ambiente de publicação.
- Não foi executado novo pentest Strix nesta publicação; o relatório anterior registra o bloqueio por ausência de daemon Docker.

### Próximas etapas

1. Tratar as dependências sinalizadas com atualização e regressão apropriadas.
2. Validar a integração real com Gemini e seus limites.
3. Automatizar verificações em CI.
4. Preparar hospedagem, backup, retenção de dados e observabilidade de produção.

---

Desenvolvido por [Gabriel Bizerra](https://github.com/gabesxan). Dados e contas de demonstração são fictícios.
