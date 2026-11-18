import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import type { AppEnv } from '../config/env.js';
import { AppError } from '../lib/errors.js';

export async function registerSecurityPlugins(app: FastifyInstance, env: AppEnv): Promise<void> {
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
      },
    },
    frameguard: { action: 'deny' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'no-referrer' },
  });

  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, false);
        return;
      }
      callback(null, env.corsOrigins.includes(origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
    maxAge: 600,
  });

  await app.register(cookie);

  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: (_req, context) =>
      new AppError(
        429,
        'RATE_LIMITED',
        `Muitas requisições em sequência. Aguarde ${Math.ceil(context.ttl / 1000)} segundos e tente novamente.`,
      ),
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      const fields = error.issues.map((issue) => ({
        path: issue.path.join('.') || 'payload',
        message: issue.message,
      }));
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dados inválidos na requisição.',
          details: { fields },
        },
      });
    }

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      });
    }

    const fastifyErr = error as { statusCode?: number; code?: string; message?: string };
    if (fastifyErr.statusCode === 429) {
      return reply.status(429).send({
        error: {
          code: 'RATE_LIMITED',
          message: fastifyErr.message ?? 'Limite de requisições atingido.',
        },
      });
    }

    if (fastifyErr.statusCode === 413 || fastifyErr.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return reply.status(413).send({
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'O conteúdo enviado excede o tamanho máximo permitido.',
        },
      });
    }

    if (fastifyErr.statusCode && fastifyErr.statusCode >= 400 && fastifyErr.statusCode < 500) {
      return reply.status(fastifyErr.statusCode).send({
        error: {
          code: 'BAD_REQUEST',
          message: 'Requisição inválida.',
        },
      });
    }

    request.log.error(
      {
        errName: error instanceof Error ? error.name : 'UnknownError',
        method: request.method,
        url: request.url,
      },
      'Erro interno não tratado',
    );

    return reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Erro interno ao processar a requisição.',
      },
    });
  });
}
