import type { UserRole } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { AppEnv } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import {
  resolveActiveSession,
  verifyCsrfToken,
  type AuthenticatedSession,
} from '../lib/session.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthenticatedSession | null;
  }
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function validateRequestOrigin(request: FastifyRequest, allowedOrigins: string[]): void {
  if (!MUTATING_METHODS.has(request.method)) return;

  const originHeader = request.headers.origin;
  if (typeof originHeader === 'string' && originHeader.length > 0) {
    if (!allowedOrigins.includes(originHeader)) {
      throw new AppError(403, 'FORBIDDEN_ORIGIN', 'Origem não autorizada para esta operação.');
    }
    return;
  }

  const refererHeader = request.headers.referer;
  if (typeof refererHeader === 'string' && refererHeader.length > 0) {
    try {
      const refererOrigin = new URL(refererHeader).origin;
      if (!allowedOrigins.includes(refererOrigin)) {
        throw new AppError(403, 'FORBIDDEN_ORIGIN', 'Origem não autorizada para esta operação.');
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(403, 'FORBIDDEN_ORIGIN', 'Origem inválida.');
    }
  }
}

export async function registerAuthPlugin(
  app: FastifyInstance,
  prisma: PrismaClient,
  env: AppEnv,
): Promise<void> {
  app.decorateRequest('auth', null);

  app.addHook('onRequest', async (request) => {
    validateRequestOrigin(request, env.corsOrigins);
  });

  app.addHook('preValidation', async (request) => {
    const rawToken = request.cookies[env.SESSION_COOKIE_NAME];
    request.auth = await resolveActiveSession(prisma, rawToken);
  });
}

export function requireAuth(enforceCsrf = true) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!request.auth) {
      throw new AppError(401, 'UNAUTHORIZED', 'Sessão ausente, expirada ou revogada.');
    }

    if (enforceCsrf && MUTATING_METHODS.has(request.method)) {
      const header = request.headers['x-csrf-token'];
      const provided = typeof header === 'string' ? header : undefined;
      if (!verifyCsrfToken(request.auth.csrfSecret, provided)) {
        throw new AppError(403, 'INVALID_CSRF_TOKEN', 'Token CSRF inválido ou ausente.');
      }
    }
  };
}

export function requireRole(allowedRoles: readonly UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await requireAuth(true)(request, reply);
    const auth = request.auth;
    if (!auth || !allowedRoles.includes(auth.user.role)) {
      throw new AppError(403, 'FORBIDDEN', 'Você não possui permissão para esta operação.');
    }
  };
}
