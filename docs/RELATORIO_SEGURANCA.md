# Relatório de Segurança — RETORNO

> Registro do ciclo de desenvolvimento anterior. Para resultados reexecutados e pendências atuais de dependências, consulte [Validação da publicação v1.0.0](VALIDACAO_V1.md). As contagens de auditoria abaixo são históricas.

Este relatório consolida os três momentos de verificação exigidos no desenvolvimento do **RETORNO**: revisão do desenho antes de codificar (**Momento A**), testes de abuso e revisão contínua por incremento (**Momento B**), e auditoria integrada final de código, dependências, segredos e execução (**Momento C**).

> **Posicionamento de segurança**: controles técnicos e verificações automatizadas reduzem riscos exploráveis conhecidos, mas nenhum sistema conectado deve ser apresentado como _"100% seguro"_. O relatório documenta exatamente o que foi verificado, corrigido, retestado e o que ficou limitado pelo ambiente ou fora do escopo desta versão.

---

## 1. Momento A — Revisão do Desenho (Pré-Código)

Antes da implementação dos módulos da aplicação, foram mapeados em [MATRIZ_PERMISSOES.md](MATRIZ_PERMISSOES.md):

- **Ativos sensíveis**: hashes `scrypt`, tokens opacos de sessão (`SHA-256` em `sessions`), segredo CSRF por sessão, variável `GEMINI_API_KEY`, notas internas (`INTERNAL`), chamados de solicitantes distintos e rascunhos privados.
- **Fronteiras de confiança**: navegador não confiável → Fastify (Zod `.strict()` + Origin + CSRF + RBAC) → MySQL parametrizado (Prisma + `Prisma.sql`) → IA (`@google/genai` com delimitação de contexto não confiável e validação de citações) → renderização Markdown (`marked` com escape de HTML bruto + `DOMPurify`).
- **Matriz de permissões**: explícita para `REQUESTER`, `AGENT` e `ADMIN` em todas as rotas da API.

---

## 2. Momento B — Falhas Encontradas, Correções e Retestes

Durante a implementação incremental, testes de integração e varreduras estáticas, foram identificadas e corrigidas as seguintes falhas reais:

### B.1. Vulnerabilidade de DoS em `zod < 4.6.6` (`GHSA-mrhx-c7xc-m3w5`)

- **Descoberta**: A primeira execução de `npm audit` apontou severidade **High** em `zod` (`3.25.x`, usado na validação de entrada da API) devido à exaustão de memória ao validar coleções restritas de tamanho excessivo.
- **Impacto**: Risco potencial de degradação de disponibilidade por payload manipulado em endpoints JSON.
- **Correção**: Atualização de `@retorno/api` para `zod@^4.6.7` em [apps/api/package.json](../apps/api/package.json) e adaptação do handler global de erros em [apps/api/src/plugins/security.ts](../apps/api/src/plugins/security.ts) para usar `error.issues`.
- **Reteste**: `npm audit` após atualização não aponta mais nenhuma vulnerabilidade em `zod`; `typecheck` e toda a suíte backend executaram sem regressões.

### B.2. `errorResponseBuilder` do `@fastify/rate-limit` retornava HTTP `500` em vez de `429`

- **Descoberta**: No teste de abuso nº 7 (`apps/api/test/abuse-cases.test.ts`), a terceira tentativa consecutiva em `POST /api/auth/login` recebeu HTTP `500 INTERNAL_ERROR` em vez de `429 RATE_LIMITED`.
- **Evidência e causa raiz**: Na implementação de `@fastify/rate-limit`, o resultado de `errorResponseBuilder` é lançado (`throw`) para o `setErrorHandler` do Fastify. Retornar um objeto literal sem `statusCode` ou instância `AppError` fazia o handler global tratar a exceção como erro interno não tratado (`500`).
- **Correção**: Alteração de `errorResponseBuilder` em [apps/api/src/plugins/security.ts](../apps/api/src/plugins/security.ts) para retornar `new AppError(429, 'RATE_LIMITED', ...)` e configuração de `hook: 'preValidation'` no login e `hook: 'preHandler'` na IA (após resolução de `request.auth` em `preValidation` no [apps/api/src/plugins/auth.ts](../apps/api/src/plugins/auth.ts)).
- **Reteste**: O teste de abuso nº 7 passou a receber `429` tanto no limite de login quanto nos limites de taxa e concorrência da IA.

### B.3. Falso positivo de documentação suficiente por preposições curtas na busca da KB

- **Descoberta**: No teste de fronteira da IA (`apps/api/test/ai-boundaries.test.ts`), o chamado sem documentação na base (`Zebra RFD40`) obteve `sufficientDocumentation: true` por match espúrio com a preposição `"no"` (`length === 2`) em títulos e resumos de outros artigos.
- **Impacto**: Violação do requisito de honestidade da IA (citar artigo não relacionado e sugerir resposta fora do escopo em vez de informar falta de documentação).
- **Correção**: Em [apps/api/src/modules/kb/search.ts](../apps/api/src/modules/kb/search.ts), `extractSearchTokens` passou a exigir `t.length >= 3` com allowlist explícita apenas para siglas técnicas do domínio (`pdv`, `tef`, `usb`, `nf`, `ip`, `nfe`, `sat`, `csc`, `xml`) e stopwords ampliadas; em [apps/api/src/modules/ai/service.ts](../apps/api/src/modules/ai/service.ts), reforçado o limiar `strongArticleMatches`.
- **Reteste**: Chamados sem cobertura documental (`RET-0018` no dev/E2E e `RET-0003` no banco de testes) passaram a retornar `sufficientDocumentation: false`, explicação clara da limitação e sugestão objetiva de pergunta ao cliente.

### B.4. Sanitização Markdown e validação de protocolo contra XSS persistente

- **Descoberta**: No primeiro teste unitário em `apps/web/src/__tests__/markdown.test.ts`, confirmou-se que escapar HTML bruto no `marked` neutralizava execução, mas gerava string escapada `&lt;img ... onerror=...&gt;` no HTML serializado.
- **Verificação e proteção aplicada**: Validado em JSDOM (`apps/web/src/__tests__/markdown.test.ts`) e no navegador real via Playwright (`e2e/desktop.spec.ts`) que `<script>`, `<img onerror=...>`, `<svg onload=...>` e links `javascript:`/`data:text/html` não criam nenhum nó executável no DOM (`querySelector('script, img, svg') === null`) e `window.__xssTriggered` permanece `undefined`.

---

## 3. Verificação dos 8 Casos de Abuso Obrigatórios (Seção 7)

Todos os 8 cenários estão implementados com asserções executáveis contra MySQL isolado (`retorno_test`) em [abuse-cases.test.ts](../apps/api/test/abuse-cases.test.ts), complementados pelos testes em [auth-session.test.ts](../apps/api/test/auth-session.test.ts), [tickets-rbac.test.ts](../apps/api/test/tickets-rbac.test.ts), [kb-xss.test.ts](../apps/api/test/kb-xss.test.ts), [ai-boundaries.test.ts](../apps/api/test/ai-boundaries.test.ts), [markdown.test.ts](../apps/web/src/__tests__/markdown.test.ts) e [desktop.spec.ts](../e2e/desktop.spec.ts):

| #   | Tentativa testada                                                   | Resultado verificado                                                                                                                                     | Onde                                            |
| --- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 1   | Solicitante A consulta ou altera chamado de B                       | Recusado com `403 FORBIDDEN` sem expor dados de B                                                                                                        | `abuse-cases.test.ts`                           |
| 2   | Solicitante tenta ler, buscar ou criar notas internas               | `visibility: INTERNAL` ausente no JSON da API, busca ignora notas, `POST` retorna `403`                                                                  | `abuse-cases.test.ts` + `desktop.spec.ts`       |
| 3   | Atendente/Solicitante tenta se promover (`ADMIN`) ou injetar campos | Rejeitado com `403` / `400` (Zod `.strict()`); papel no banco permanece inalterado                                                                       | `abuse-cases.test.ts`                           |
| 4   | Reuso de cookie `retorno_sid` após logout ou desativação            | Sessão marcada com `revokedAt` no servidor; reuso retorna `401 UNAUTHORIZED`                                                                             | `abuse-cases.test.ts` + `auth-session.test.ts`  |
| 5   | Mensagem/artigo tenta executar JavaScript (XSS persistente)         | HTML bruto escapado, tags perigosas bloqueadas no `DOMPurify`, protocolos fora de `http/https/mailto/#` removidos                                        | `markdown.test.ts` + `desktop.spec.ts`          |
| 6   | Prompt injection no texto do chamado                                | Notas internas excluídas por padrão, tags delimitadoras neutralizadas (`[tag-removida]`), chaves nunca entram no prompt, citações alucinadas descartadas | `abuse-cases.test.ts` + `ai-boundaries.test.ts` |
| 7   | Rajada de requisições em login e IA                                 | Rate limiting (`429 RATE_LIMITED`) + semáforo de concorrência (`429 AI_CONCURRENCY_LIMIT`)                                                               | `abuse-cases.test.ts`                           |
| 8   | Alterações concorrentes / envio duplicado                           | `PATCH` / `resolve` / `reopen` com `expectedVersion` obsoleto retorna `409 VERSION_CONFLICT`; `idempotencyKey` deduplica mensagens                       | `abuse-cases.test.ts`                           |

---

## 4. Momento C — Auditoria Final, Varredura de Segredos e Strix

### 4.1. Varredura de segredos

- Executado `npm run security:secrets` ([secret-scan.mjs](../scripts/secret-scan.mjs)).
- Durante o ciclo, o scanner detectou um literal sintético de teste em `abuse-cases.test.ts` (`sk-teste-ficticio-nao-vazar`), posteriormente substituído por `DUMMY_TEST_ONLY_VALUE` mantendo a regra estrita do scanner ativa. Resultado final: **`Secret scan passed: 0 real secret patterns detected.`**
- Confirmado no E2E que `window.localStorage` permanece vazio (`length === 0`) e que nenhum segredo `GEMINI_API_KEY` existe no bundle frontend.

### 4.2. Auditoria de dependências (`npm audit`)

- **Dependências de produção da aplicação (`fastify`, `@fastify/*`, `@prisma/client`, `mysql2`, `@google/genai`, `zod`, `react`, `react-router`, `dompurify`, `marked`)**: **0 vulnerabilidades reportadas**.
- **Ferramentas de CLI/desenvolvimento (`npm audit`)**:
  - `deepmerge-ts < 8.0.0` (`GHSA-ggr8-5vv4-36mx`, High) via `@prisma/config` → `prisma@6.19.3` (CLI de migrations/desenvolvimento, não carregada no runtime HTTP da API). Testou-se `overrides` para `8.0.0`, porém o `npm ls` apontou incompatibilidade de versão exigida por `@prisma/config@6.19.3`; o override foi revertido para preservar a integridade do Prisma 6.19.3.
  - `picomatch` (`GHSA-fc5q-39xc-vjpf`, High) via `tinyglobby` em ferramentas exclusivamente de desenvolvimento/teste (`eslint`, `typescript-eslint`, `vite`, `vitest`). Nenhuma dessas árvores executa em produção HTTP.

### 4.3. Execução do Strix contra instância local

- Comando executado contra o workspace local: `strix -n -m quick --max-turns 5 -t "."`.
- **Bloqueio de infraestrutura observado**: o `strix` exige daemon Docker operacional para baixar e executar seu container sandbox, retornando literalmente:
  `DOCKER NOT AVAILABLE — Cannot connect to Docker daemon. ... RuntimeError: Docker not available` (o serviço Docker/Colima no host estava sem daemon ativo).
- Consequentemente, a análise dinâmica do `strix` ficou **bloqueada pelo ambiente**, não devendo ser interpretada como aprovação automática; toda a verificação dinâmica foi coberta pela suíte automatizada de integração/abuso (18 testes), Vitest (4 testes), Playwright desktop+mobile e revisão manual linha a linha.

### 4.4. Revisão manual e limitações conhecidas (pendências documentadas)

- **Cabeçalhos CSP do frontend estático**: a API Fastify aplica Helmet (`default-src 'none'; frame-ancestors 'none'`). Em deploy de produção dos arquivos estáticos de `apps/web/dist`, recomenda-se configurar no proxy reverso (Nginx/Caddy) `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none';` (as fontes já estão auto-hospedadas no bundle via `@fontsource/*`).
- **Rate limiting em memória**: o store padrão do `@fastify/rate-limit` e o semáforo de concorrência da IA operam na memória do processo Node único. Caso a aplicação seja escalada horizontalmente para múltiplas instâncias, deve-se acoplar um store compartilhado (ex.: Redis).
- **Chave Gemini não configurada no ambiente de verificação**: as chamadas ao SDK `@google/genai` foram validadas em integração com gateway simulado (`aiOverride`) para os fluxos de parsing Zod, delimitação de prompt, filtragem de citações e versionamento otimista, e em modo simulado local explicitamente identificado no navegador. A chamada real à nuvem Google Gemini aguarda configuração de `GEMINI_API_KEY` em `.env`.
