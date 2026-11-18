import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import { buildApp } from '../src/app.js';
import { createTestEnv, createTestPrisma, loginAs, resetTestDatabase } from './helpers.js';

describe('Base de Conhecimento (MySQL FULLTEXT + RBAC)', () => {
  const prisma = createTestPrisma();
  const env = createTestEnv();

  after(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });

  it('restringe leitura para REQUESTER e escrita para AGENT, liberando apenas ADMIN para criar/editar', async () => {
    const fixtures = await resetTestDatabase(prisma);
    const { app } = await buildApp({ env, prisma });

    try {
      const reqA = await loginAs(app, fixtures.requesterA.email, fixtures.password);
      const agent = await loginAs(app, fixtures.agent.email, fixtures.password);
      const admin = await loginAs(app, fixtures.admin.email, fixtures.password);

      const reqKb = await app.inject({
        method: 'GET',
        url: '/api/kb/articles',
        headers: { cookie: reqA.cookieHeader },
      });
      assert.equal(reqKb.statusCode, 403);

      const agentList = await app.inject({
        method: 'GET',
        url: '/api/kb/articles?q=TEF&includeUnpublished=true',
        headers: { cookie: agent.cookieHeader },
      });
      assert.equal(agentList.statusCode, 200);
      assert.equal(agentList.json().articles.length, 1);
      assert.equal(agentList.json().articles[0].slug, 'tef-pinpad-teste');

      // Agent não lê artigo em rascunho nem pode criar
      const agentDraft = await app.inject({
        method: 'GET',
        url: `/api/kb/articles/${fixtures.draftArticleId}`,
        headers: { cookie: agent.cookieHeader },
      });
      assert.equal(agentDraft.statusCode, 404);

      const agentCreate = await app.inject({
        method: 'POST',
        url: '/api/kb/articles',
        headers: { cookie: agent.cookieHeader, 'x-csrf-token': agent.csrfToken },
        payload: {
          title: 'Tentativa não autorizada',
          category: 'OTHER',
          summary: 'Resumo qualquer válido para teste',
          tags: 'teste',
          bodyMarkdown: 'Conteúdo mínimo com mais de vinte caracteres.',
        },
      });
      assert.equal(agentCreate.statusCode, 403);

      const adminCreate = await app.inject({
        method: 'POST',
        url: '/api/kb/articles',
        headers: { cookie: admin.cookieHeader, 'x-csrf-token': admin.csrfToken },
        payload: {
          title: 'Configuração de gaveta RJ11 no caixa',
          category: 'PRINTER_HARDWARE',
          summary: 'Como habilitar pulso de abertura da gaveta na impressora Elgin.',
          tags: 'gaveta, elgin, rj11',
          bodyMarkdown: '## Gaveta\nHabilite o pino 2 no configurador de periféricos.',
          isPublished: true,
        },
      });
      assert.equal(adminCreate.statusCode, 201);

      const searchNew = await app.inject({
        method: 'GET',
        url: '/api/kb/articles?q=gaveta+RJ11',
        headers: { cookie: agent.cookieHeader },
      });
      assert.equal(searchNew.statusCode, 200);
      assert.equal(searchNew.json().articles[0].title, 'Configuração de gaveta RJ11 no caixa');
    } finally {
      await app.close();
    }
  });
});
