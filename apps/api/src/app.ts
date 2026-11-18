import type { PrismaClient } from '@prisma/client';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { AppEnv } from './config/env.js';
import { createPrismaClient } from './lib/prisma.js';
import { registerAiRoutes } from './modules/ai/routes.js';
import type { AiGatewayOverride } from './modules/ai/service.js';
import { registerAuthRoutes } from './modules/auth/routes.js';
import { registerKbRoutes } from './modules/kb/routes.js';
import { registerTicketRoutes } from './modules/tickets/routes.js';
import { registerUserRoutes } from './modules/users/routes.js';
import { registerAuthPlugin } from './plugins/auth.js';
import { registerSecurityPlugins } from './plugins/security.js';

export interface BuildAppOptions {
  env: AppEnv;
  prisma?: PrismaClient;
  logger?: FastifyServerOptions['logger'];
  loginRateLimitMax?: number;
  aiRateLimitMax?: number;
  aiOverride?: AiGatewayOverride;
  maxConcurrentPerUser?: number;
  maxConcurrentGlobal?: number;
}

export async function buildApp(options: BuildAppOptions): Promise<{
  app: FastifyInstance;
  prisma: PrismaClient;
}> {
  const prisma = options.prisma ?? createPrismaClient(options.env.DATABASE_URL);
  const ownsPrisma = !options.prisma;

  const app = Fastify({
    trustProxy: false,
    bodyLimit: 262_144,
    logger: options.logger ?? false,
  });

  if (ownsPrisma) {
    app.addHook('onClose', async () => {
      await prisma.$disconnect();
    });
  }

  await registerSecurityPlugins(app, options.env);
  await registerAuthPlugin(app, prisma, options.env);

  app.get('/api/health', async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, service: 'retorno-api' };
  });

  await registerAuthRoutes(app, prisma, options.env, {
    loginRateLimitMax: options.loginRateLimitMax,
  });
  await registerUserRoutes(app, prisma);
  await registerTicketRoutes(app, prisma);
  await registerKbRoutes(app, prisma);
  await registerAiRoutes(app, prisma, options.env, {
    aiRateLimitMax: options.aiRateLimitMax,
    aiOverride: options.aiOverride,
    maxConcurrentPerUser: options.maxConcurrentPerUser,
    maxConcurrentGlobal: options.maxConcurrentGlobal,
  });

  return { app, prisma };
}
