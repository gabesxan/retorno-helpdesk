import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import { buildApp } from '../src/app.js';
import { createTestEnv, createTestPrisma, loginAs, resetTestDatabase } from './helpers.js';

describe('IA com limites explícitos, citações válidas e indisponibilidade', () => {
  const prisma = createTestPrisma();

  after(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });

  it('identifica modo simulado, cita artigos reais e sinaliza falta de documentação sem inventar passos', async () => {
    const fixtures = await resetTestDatabase(prisma);
    const env = createTestEnv({ AI_ALLOW_SIMULATED_FALLBACK: true, GEMINI_API_KEY: undefined });
    const { app } = await buildApp({ env, prisma });

    try {
      const reqA = await loginAs(app, fixtures.requesterA.email, fixtures.password);
      const agent = await loginAs(app, fixtures.agent.email, fixtures.password);

      // Solicitante não pode chamar IA
      const forbidden = await app.inject({
        method: 'POST',
        url: `/api/tickets/${fixtures.ticketAId}/ai/classify`,
        headers: { cookie: reqA.cookieHeader, 'x-csrf-token': reqA.csrfToken },
        payload: {},
      });
      assert.equal(forbidden.statusCode, 403);

      // Classificação de impressora
      const classify = await app.inject({
        method: 'POST',
        url: `/api/tickets/${fixtures.ticketAId}/ai/classify`,
        headers: { cookie: agent.cookieHeader, 'x-csrf-token': agent.csrfToken },
        payload: {},
      });
      assert.equal(classify.statusCode, 200);
      assert.equal(classify.json().suggestion.mode, 'simulated');
      assert.equal(classify.json().suggestion.suggestedCategory, 'PRINTER_HARDWARE');
      assert.equal(classify.json().suggestion.usedInternalNotes, false);

      // Rascunho com artigo real da base
      const draftOk = await app.inject({
        method: 'POST',
        url: `/api/tickets/${fixtures.ticketAId}/ai/draft-reply`,
        headers: { cookie: agent.cookieHeader, 'x-csrf-token': agent.csrfToken },
        payload: {},
      });
      assert.equal(draftOk.statusCode, 200);
      assert.equal(draftOk.json().draft.sufficientDocumentation, true);
      assert.equal(draftOk.json().draft.citations[0].articleId, fixtures.publishedPrinterArticleId);

      // Chamado sem documentação na base (Zebra RFD40)
      const draftMissing = await app.inject({
        method: 'POST',
        url: `/api/tickets/${fixtures.ticketUndocumentedId}/ai/draft-reply`,
        headers: { cookie: agent.cookieHeader, 'x-csrf-token': agent.csrfToken },
        payload: {},
      });
      assert.equal(draftMissing.statusCode, 200);
      assert.equal(draftMissing.json().draft.sufficientDocumentation, false);
      assert.equal(draftMissing.json().draft.draftText, '');
      assert.ok(draftMissing.json().draft.limitationNotice);
      assert.ok(draftMissing.json().draft.suggestedQuestion);
      assert.equal(draftMissing.json().draft.citations.length, 0);
    } finally {
      await app.close();
    }
  });

  it('filtra citações inventadas pelo modelo, detecta alteração concorrente e exige motivo para notas internas', async () => {
    const fixtures = await resetTestDatabase(prisma);
    const env = createTestEnv({ AI_ALLOW_SIMULATED_FALLBACK: false });

    const { app } = await buildApp({
      env,
      prisma,
      aiOverride: {
        generateJson: async () => {
          // Simula alteração concorrente no chamado durante a chamada de IA
          await prisma.ticket.update({
            where: { id: fixtures.ticketAId },
            data: { version: { increment: 1 } },
          });

          return {
            sufficientDocumentation: true,
            limitationNotice: null,
            suggestedQuestion: null,
            draftText: 'Verifique a porta USB. Veja [x](javascript:alert(1)).',
            citations: [
              {
                articleId: fixtures.publishedPrinterArticleId,
                excerpt: 'Faça autoteste com FEED.',
              },
              { articleId: 'artigo-inventado-999', excerpt: 'Fonte falsa alucinada.' },
            ],
          };
        },
      },
    });

    try {
      const agent = await loginAs(app, fixtures.agent.email, fixtures.password);

      const missingReason = await app.inject({
        method: 'POST',
        url: `/api/tickets/${fixtures.ticketAId}/ai/draft-reply`,
        headers: { cookie: agent.cookieHeader, 'x-csrf-token': agent.csrfToken },
        payload: { includeInternalNotes: true, internalNotesReason: 'curto' },
      });
      assert.equal(missingReason.statusCode, 400);

      const res = await app.inject({
        method: 'POST',
        url: `/api/tickets/${fixtures.ticketAId}/ai/draft-reply`,
        headers: { cookie: agent.cookieHeader, 'x-csrf-token': agent.csrfToken },
        payload: {},
      });
      assert.equal(res.statusCode, 200);
      const body = res.json().draft;
      assert.equal(body.mode, 'gemini');
      assert.equal(body.staleDuringGeneration, true);
      assert.equal(body.citations.length, 1);
      assert.equal(body.citations[0].articleId, fixtures.publishedPrinterArticleId);
      assert.doesNotMatch(body.draftText, /javascript:/i);
    } finally {
      await app.close();
    }
  });

  it('retorna 503 sem bloquear atendimento manual quando IA não está configurada e fallback está desligado', async () => {
    const fixtures = await resetTestDatabase(prisma);
    const env = createTestEnv({ AI_ALLOW_SIMULATED_FALLBACK: false, GEMINI_API_KEY: undefined });
    const { app } = await buildApp({ env, prisma });

    try {
      const agent = await loginAs(app, fixtures.agent.email, fixtures.password);

      const aiRes = await app.inject({
        method: 'POST',
        url: `/api/tickets/${fixtures.ticketAId}/ai/draft-reply`,
        headers: { cookie: agent.cookieHeader, 'x-csrf-token': agent.csrfToken },
        payload: {},
      });
      assert.equal(aiRes.statusCode, 503);

      // Atendimento manual segue funcionando normalmente
      const manualRes = await app.inject({
        method: 'POST',
        url: `/api/tickets/${fixtures.ticketAId}/messages`,
        headers: { cookie: agent.cookieHeader, 'x-csrf-token': agent.csrfToken },
        payload: { visibility: 'PUBLIC', body: 'Resposta manual enviada sem depender da IA.' },
      });
      assert.equal(manualRes.statusCode, 201);
    } finally {
      await app.close();
    }
  });
});
