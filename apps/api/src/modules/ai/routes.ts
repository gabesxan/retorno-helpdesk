import { UserRole, type PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppEnv } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { requireRole } from '../../plugins/auth.js';
import { AiConcurrencyLimiter, AiSupportService, type AiGatewayOverride } from './service.js';

const ticketParamsSchema = z.object({
  id: z.string().trim().min(1).max(64),
});

const aiRequestSchema = z
  .object({
    includeInternalNotes: z.boolean().default(false),
    internalNotesReason: z.string().trim().max(300).optional(),
  })
  .strict();

function assertInternalNotesDecision(body: z.infer<typeof aiRequestSchema>): void {
  if (body.includeInternalNotes) {
    const reason = body.internalNotesReason?.trim() ?? '';
    if (reason.length < 15) {
      throw new AppError(
        400,
        'INTERNAL_NOTES_REASON_REQUIRED',
        'Para enviar notas internas à IA, informe uma justificativa explícita com ao menos 15 caracteres.',
      );
    }
  }
}

export async function registerAiRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  env: AppEnv,
  options?: {
    aiRateLimitMax?: number;
    aiOverride?: AiGatewayOverride;
    maxConcurrentPerUser?: number;
    maxConcurrentGlobal?: number;
  },
): Promise<void> {
  const limiter = new AiConcurrencyLimiter(
    options?.maxConcurrentPerUser ?? env.AI_MAX_CONCURRENT_PER_USER,
    options?.maxConcurrentGlobal ?? env.AI_MAX_CONCURRENT_GLOBAL,
  );
  const service = new AiSupportService(prisma, env, limiter, options?.aiOverride);
  const maxPerMinute = options?.aiRateLimitMax ?? env.AI_RATE_LIMIT_PER_MIN;

  const rateLimitConfig = {
    hook: 'preHandler' as const,
    max: maxPerMinute,
    timeWindow: '1 minute',
    keyGenerator: (req: { auth: { user: { id: string } } | null; ip: string }) =>
      `ai:${req.auth?.user.id ?? req.ip}`,
  };

  app.post(
    '/api/tickets/:id/ai/classify',
    {
      preHandler: [requireRole([UserRole.AGENT, UserRole.ADMIN])],
      config: { rateLimit: rateLimitConfig },
    },
    async (request) => {
      const auth = request.auth!;
      const { id } = ticketParamsSchema.parse(request.params);
      const body = aiRequestSchema.parse(request.body ?? {});
      assertInternalNotesDecision(body);

      const suggestion = await service.suggestClassification({
        userId: auth.user.id,
        ticketId: id,
        includeInternalNotes: body.includeInternalNotes,
      });

      return { suggestion };
    },
  );

  app.post(
    '/api/tickets/:id/ai/draft-reply',
    {
      preHandler: [requireRole([UserRole.AGENT, UserRole.ADMIN])],
      config: { rateLimit: rateLimitConfig },
    },
    async (request) => {
      const auth = request.auth!;
      const { id } = ticketParamsSchema.parse(request.params);
      const body = aiRequestSchema.parse(request.body ?? {});
      assertInternalNotesDecision(body);

      const draft = await service.prepareDraftReply({
        userId: auth.user.id,
        ticketId: id,
        includeInternalNotes: body.includeInternalNotes,
      });

      return { draft };
    },
  );
}
