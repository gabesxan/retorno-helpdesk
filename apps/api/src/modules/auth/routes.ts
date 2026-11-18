import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppEnv } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { DUMMY_PASSWORD_HASH, verifyPassword } from '../../lib/password.js';
import { createSession, revokeSessionById } from '../../lib/session.js';
import { requireAuth } from '../../plugins/auth.js';

const loginSchema = z
  .object({
    email: z.string().trim().email('Informe um e-mail válido.').max(180),
    password: z.string().min(1, 'Informe a senha.').max(200),
  })
  .strict();

export async function registerAuthRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  env: AppEnv,
  options?: { loginRateLimitMax?: number },
): Promise<void> {
  const loginMax = options?.loginRateLimitMax ?? 10;

  app.post(
    '/api/auth/login',
    {
      config: {
        rateLimit: {
          hook: 'preValidation',
          max: loginMax,
          timeWindow: '15 minutes',
          keyGenerator: (req) => {
            const body = req.body as { email?: string } | undefined;
            const emailPart =
              typeof body?.email === 'string' ? body.email.trim().toLowerCase().slice(0, 80) : '';
            return `${req.ip}:${emailPart}`;
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = loginSchema.parse(request.body);
      const email = parsed.email.toLowerCase();

      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          name: true,
          email: true,
          passwordHash: true,
          role: true,
          companyName: true,
          isActive: true,
        },
      });

      const hashToCheck = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
      const passwordOk = await verifyPassword(parsed.password, hashToCheck);

      if (!user || !passwordOk || !user.isActive) {
        throw new AppError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha inválidos.');
      }

      const { rawToken, csrfSecret, expiresAt } = await createSession(prisma, {
        userId: user.id,
        ttlHours: env.SESSION_TTL_HOURS,
        userAgent:
          typeof request.headers['user-agent'] === 'string'
            ? request.headers['user-agent']
            : undefined,
        ipAddress: request.ip,
      });

      reply.setCookie(env.SESSION_COOKIE_NAME, rawToken, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: env.COOKIE_SECURE,
        maxAge: env.SESSION_TTL_HOURS * 60 * 60,
      });

      return {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          companyName: user.companyName,
          isActive: user.isActive,
        },
        csrfToken: csrfSecret,
        expiresAt: expiresAt.toISOString(),
      };
    },
  );

  app.get('/api/auth/me', { preHandler: [requireAuth(false)] }, async (request) => {
    const auth = request.auth!;
    return {
      user: auth.user,
      csrfToken: auth.csrfSecret,
      expiresAt: auth.expiresAt.toISOString(),
    };
  });

  app.post('/api/auth/logout', { preHandler: [requireAuth(true)] }, async (request, reply) => {
    const auth = request.auth!;
    await revokeSessionById(prisma, auth.sessionId);

    reply.clearCookie(env.SESSION_COOKIE_NAME, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: env.COOKIE_SECURE,
    });

    return { ok: true };
  });
}
