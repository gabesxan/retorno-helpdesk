# Validação da publicação v1.0.0

Verificação realizada em 18/11/2026, com Node.js 26.13.0. Este registro complementa o relatório do desenvolvimento e não representa certificação ou auditoria independente.

| Verificação                  | Resultado desta publicação                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| ESLint                       | Passou.                                                                                                                                     |
| TypeScript da API e frontend | Passou.                                                                                                                                     |
| Testes backend               | 18 passaram em 5 suítes, usando `retorno_test` em MySQL local.                                                                              |
| Testes frontend              | 4 passaram em 2 arquivos.                                                                                                                   |
| Build API e frontend         | Passou.                                                                                                                                     |
| Scanner local de segredos    | Passou, sem padrões encontrados pelas regras do scanner.                                                                                    |
| E2E Playwright               | Não reexecutado; os cenários alteram a demonstração e podem reutilizar servidores existentes. Capturas do ciclo anterior foram preservadas. |
| Gemini real                  | Não validado. Testes usam gateway controlado/simulação identificada.                                                                        |
| Pentest Strix                | Não executado nesta publicação.                                                                                                             |
| `npm audit`                  | 14 ocorrências altas, 0 críticas.                                                                                                           |
| `npm audit --omit=dev`       | 3 ocorrências altas na cadeia Prisma CLI, 0 críticas.                                                                                       |

## Pendências de dependências

As ocorrências propagam dois avisos de dependências transitivas:

- `deepmerge-ts`: [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx), presente na cadeia de configuração do Prisma CLI.
- `picomatch`: [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), presente em ferramentas de build, análise e testes.

O número de ocorrências inclui pacotes afetados indiretamente; não equivale a 14 avisos independentes. A atualização deve preservar a compatibilidade do projeto e ser acompanhada por regressão. Não foi aplicado `npm audit fix --force` na preparação da publicação.

## Escopo da publicação

Foram preparados README, fluxograma, links portáveis da documentação e regras de exclusão do Git. Arquivos `.env`, dependências instaladas, dados locais, saídas de build e relatórios temporários não fazem parte da publicação. Contas e senhas descritas são exclusivamente da demonstração fictícia local.
