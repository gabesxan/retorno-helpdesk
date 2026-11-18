import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import { buildApp } from '../src/app.js';
import { hashPassword, verifyPassword } from '../src/lib/password.js';
import { createTestEnv, createTestPrisma, loginAs, resetTestDatabase } from './helpers.js';

describe('Autenticação, scrypt, sessões revogáveis e segurança HTTP', () => {
  const prisma = createTestPrisma();
  const env = createTestEnv();

  after(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });

  it('gera hash scrypt com salt aleatório e valida com segurança', async () => {
    const hash1 = await hashPassword('SenhaForte!2026');
    const hash2 = await hashPassword('SenhaForte!2026');

    assert.notEqual(hash1, hash2);
    assert.match(hash1, /^scrypt\$16384\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    assert.equal(await verifyPassword('SenhaForte!2026', hash1), true);
    assert.equal(await verifyPassword('SenhaErrada', hash1), false);
    assert.equal(await verifyPassword('qualquer', 'invalido'), false);
  });

  it('recusa login inválido e usuário desativado, e emite cookie HttpOnly no login válido', async () => {
    const fixtures = await resetTestDatabase(prisma);
    const { app } = await buildApp({ env, prisma });

    try {
      const badPass = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: fixtures.agent.email, password: 'errada' },
      });
      assert.equal(badPass.statusCode, 401);

      const inactive = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: fixtures.inactiveUser.email, password: fixtures.password },
      });
      assert.equal(inactive.statusCode, 401);

      const ok = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: fixtures.agent.email, password: fixtures.password },
      });
      assert.equal(ok.statusCode, 200);
      const setCookie = String(ok.headers['set-cookie']);
      assert.match(setCookie, /retorno_sid=/);
      assert.match(setCookie, /HttpOnly/i);
      assert.match(setCookie, /SameSite=Lax/i);
      assert.equal(ok.headers['x-frame-options'], 'DENY');
      assert.equal(ok.headers['x-content-type-options'], 'nosniff');
    } finally {
      await app.close();
    }
  });

  it('exige X-CSRF-Token e Origin válida em mutações autenticadas', async () => {
    const fixtures = await resetTestDatabase(prisma);
    const { app } = await buildApp({ env, prisma });

    try {
      const session = await loginAs(app, fixtures.requesterA.email, fixtures.password);

      const missingCsrf = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        headers: { cookie: session.cookieHeader },
        payload: { subject: 'Teste sem CSRF', description: 'Descrição suficientemente longa.' },
      });
      assert.equal(missingCsrf.statusCode, 403);
      assert.equal(missingCsrf.json().error.code, 'INVALID_CSRF_TOKEN');

      const badOrigin = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        headers: {
          cookie: session.cookieHeader,
          'x-csrf-token': session.csrfToken,
          origin: 'https://ataque-externo.invalid',
        },
        payload: { subject: 'Teste origem', description: 'Descrição suficientemente longa.' },
      });
      assert.equal(badOrigin.statusCode, 403);
      assert.equal(badOrigin.json().error.code, 'FORBIDDEN_ORIGIN');

      const valid = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        headers: {
          cookie: session.cookieHeader,
          'x-csrf-token': session.csrfToken,
          origin: 'http://127.0.0.1:4178',
        },
        payload: {
          subject: 'Teste origem válida',
          description: 'Descrição suficientemente longa.',
        },
      });
      assert.equal(valid.statusCode, 201);
    } finally {
      await app.close();
    }
  });

  it('recusa sessão expirada diretamente no banco', async () => {
    const fixtures = await resetTestDatabase(prisma);
    const { app } = await buildApp({ env, prisma });

    try {
      const session = await loginAs(app, fixtures.agent.email, fixtures.password);
      await prisma.session.updateMany({
        where: { userId: fixtures.agent.id },
        data: { expiresAt: new Date(Date.now() - 5000) },
      });

      const me = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { cookie: session.cookieHeader },
      });
      assert.equal(me.statusCode, 401);
    } finally {
      await app.close();
    }
  });
});
