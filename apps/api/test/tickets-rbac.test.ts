import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import { buildApp } from '../src/app.js';
import { createTestEnv, createTestPrisma, loginAs, resetTestDatabase } from './helpers.js';

describe('Chamados, RBAC, notas internas, rascunhos e administração', () => {
  const prisma = createTestPrisma();
  const env = createTestEnv();

  after(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });

  it('filtra fila, paginação e contadores conforme o perfil do usuário', async () => {
    const fixtures = await resetTestDatabase(prisma);
    const { app } = await buildApp({ env, prisma });

    try {
      const reqASession = await loginAs(app, fixtures.requesterA.email, fixtures.password);
      const reqList = await app.inject({
        method: 'GET',
        url: '/api/tickets?page=1&pageSize=10',
        headers: { cookie: reqASession.cookieHeader },
      });
      assert.equal(reqList.statusCode, 200);
      const reqData = reqList.json();
      assert.equal(reqData.pagination.total, 2);
      assert.ok(reqData.items.every((t: { code: string }) => t.code !== 'RET-0002'));

      const agentSession = await loginAs(app, fixtures.agent.email, fixtures.password);
      const agentList = await app.inject({
        method: 'GET',
        url: '/api/tickets?q=estoque&page=1&pageSize=10',
        headers: { cookie: agentSession.cookieHeader },
      });
      assert.equal(agentList.statusCode, 200);
      assert.equal(agentList.json().pagination.total, 1);
      assert.equal(agentList.json().items[0].code, 'RET-0002');
    } finally {
      await app.close();
    }
  });

  it('executa fluxo completo: abrir -> classificar -> nota interna -> responder -> resolver -> reabrir', async () => {
    const fixtures = await resetTestDatabase(prisma);
    const { app } = await buildApp({ env, prisma });

    try {
      const reqA = await loginAs(app, fixtures.requesterA.email, fixtures.password);
      const agent = await loginAs(app, fixtures.agent.email, fixtures.password);

      const createdRes = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        headers: { cookie: reqA.cookieHeader, 'x-csrf-token': reqA.csrfToken },
        payload: {
          subject: 'Dificuldade para cadastrar um operador novo',
          category: 'OPERATOR_SETUP',
          description: 'Cadastrei o operador mas não aparece no caixa 03.',
        },
      });
      assert.equal(createdRes.statusCode, 201);
      const ticket = createdRes.json().ticket;
      assert.equal(ticket.code, 'RET-0004');

      // Atendente salva rascunho interno, atualiza metadados, registra nota interna e responde
      const saveDraft = await app.inject({
        method: 'PUT',
        url: `/api/tickets/${ticket.id}/drafts`,
        headers: { cookie: agent.cookieHeader, 'x-csrf-token': agent.csrfToken },
        payload: { visibility: 'PUBLIC', content: 'Rascunho em edição' },
      });
      assert.equal(saveDraft.statusCode, 200);

      const patchRes = await app.inject({
        method: 'PATCH',
        url: `/api/tickets/${ticket.id}`,
        headers: { cookie: agent.cookieHeader, 'x-csrf-token': agent.csrfToken },
        payload: {
          expectedVersion: ticket.version,
          priority: 'HIGH',
          assigneeId: agent.user.id,
          status: 'IN_PROGRESS',
        },
      });
      assert.equal(patchRes.statusCode, 200);
      const v2 = patchRes.json().ticket.version;
      assert.ok(v2 > ticket.version);

      const internalRes = await app.inject({
        method: 'POST',
        url: `/api/tickets/${ticket.id}/messages`,
        headers: { cookie: agent.cookieHeader, 'x-csrf-token': agent.csrfToken },
        payload: {
          visibility: 'INTERNAL',
          body: 'Nota interna: cliente não enviou carga para o PDV 03.',
        },
      });
      assert.equal(internalRes.statusCode, 201);
      const v3 = internalRes.json().ticketVersion;

      const publicRes = await app.inject({
        method: 'POST',
        url: `/api/tickets/${ticket.id}/messages`,
        headers: { cookie: agent.cookieHeader, 'x-csrf-token': agent.csrfToken },
        payload: {
          visibility: 'PUBLIC',
          body: 'Acesse PDV > Carga de Tabelas e clique em Enviar para todos os caixas.',
          nextStatus: 'WAITING_CUSTOMER',
        },
      });
      assert.equal(publicRes.statusCode, 201);
      const v4 = publicRes.json().ticketVersion;

      // Rascunho PUBLIC do atendente deve ter sido limpo após envio
      const detailAfterSend = await app.inject({
        method: 'GET',
        url: `/api/tickets/${ticket.id}`,
        headers: { cookie: agent.cookieHeader },
      });
      assert.equal(detailAfterSend.json().ticket.drafts.length, 0);

      const resolveRes = await app.inject({
        method: 'POST',
        url: `/api/tickets/${ticket.id}/resolve`,
        headers: { cookie: reqA.cookieHeader, 'x-csrf-token': reqA.csrfToken },
        payload: { expectedVersion: v4 },
      });
      assert.equal(resolveRes.statusCode, 200);
      assert.equal(resolveRes.json().ticket.status, 'RESOLVED');
      const v5 = resolveRes.json().ticket.version;
      assert.ok(v5 > v3);

      const reopenRes = await app.inject({
        method: 'POST',
        url: `/api/tickets/${ticket.id}/reopen`,
        headers: { cookie: reqA.cookieHeader, 'x-csrf-token': reqA.csrfToken },
        payload: { expectedVersion: v5 },
      });
      assert.equal(reopenRes.statusCode, 200);
      assert.equal(reopenRes.json().ticket.status, 'OPEN');
    } finally {
      await app.close();
    }
  });

  it('impede desativar o único administrador ativo', async () => {
    const fixtures = await resetTestDatabase(prisma);
    const { app } = await buildApp({ env, prisma });

    try {
      const admin = await loginAs(app, fixtures.admin.email, fixtures.password);
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/users/${fixtures.admin.id}`,
        headers: { cookie: admin.cookieHeader, 'x-csrf-token': admin.csrfToken },
        payload: { isActive: false },
      });
      assert.equal(res.statusCode, 400);
      assert.equal(res.json().error.code, 'LAST_ADMIN');
    } finally {
      await app.close();
    }
  });
});
