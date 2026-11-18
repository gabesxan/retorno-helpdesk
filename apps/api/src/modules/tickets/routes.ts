import {
  MessageKind,
  MessageVisibility,
  Prisma,
  TicketCategory,
  TicketPriority,
  TicketStatus,
  UserRole,
  type PrismaClient,
} from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import { normalizePlainText } from '../../lib/sanitize.js';
import { requireAuth } from '../../plugins/auth.js';
import { CATEGORY_LABELS, PRIORITY_LABELS, STATUS_LABELS } from './labels.js';

const listTicketsQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.union([z.nativeEnum(TicketStatus), z.literal('ALL')]).default('ALL'),
  priority: z.union([z.nativeEnum(TicketPriority), z.literal('ALL')]).default('ALL'),
  category: z.union([z.nativeEnum(TicketCategory), z.literal('ALL')]).default('ALL'),
  assigneeId: z.string().trim().max(64).default('ALL'),
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(15),
});

const requesterCreateSchema = z
  .object({
    subject: z.string().trim().min(5, 'Assunto muito curto.').max(180),
    category: z.nativeEnum(TicketCategory).default(TicketCategory.OTHER),
    description: z.string().trim().min(10, 'Descreva o problema com mais detalhes.').max(5000),
  })
  .strict();

const staffCreateSchema = z
  .object({
    subject: z.string().trim().min(5, 'Assunto muito curto.').max(180),
    category: z.nativeEnum(TicketCategory).default(TicketCategory.OTHER),
    priority: z.nativeEnum(TicketPriority).default(TicketPriority.MEDIUM),
    description: z.string().trim().min(10, 'Descreva o problema com mais detalhes.').max(5000),
    requesterId: z.string().trim().min(1).max(64).optional(),
  })
  .strict();

const patchTicketSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    status: z.nativeEnum(TicketStatus).optional(),
    priority: z.nativeEnum(TicketPriority).optional(),
    category: z.nativeEnum(TicketCategory).optional(),
    assigneeId: z.string().trim().min(1).max(64).nullable().optional(),
  })
  .strict();

const createMessageSchema = z
  .object({
    body: z.string().trim().min(1, 'Escreva uma mensagem antes de enviar.').max(5000),
    visibility: z.nativeEnum(MessageVisibility).default(MessageVisibility.PUBLIC),
    idempotencyKey: z.string().trim().min(8).max(80).optional(),
    nextStatus: z.enum([TicketStatus.IN_PROGRESS, TicketStatus.WAITING_CUSTOMER]).optional(),
  })
  .strict();

const versionActionSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
  })
  .strict();

const saveDraftSchema = z
  .object({
    visibility: z.nativeEnum(MessageVisibility).default(MessageVisibility.PUBLIC),
    content: z.string().max(5000),
  })
  .strict();

const deleteDraftQuerySchema = z.object({
  visibility: z.nativeEnum(MessageVisibility).default(MessageVisibility.PUBLIC),
});

const ticketIdParamsSchema = z.object({
  id: z.string().trim().min(1).max(64),
});

function formatTicketSummarySelect() {
  return {
    id: true,
    code: true,
    subject: true,
    customerName: true,
    status: true,
    priority: true,
    category: true,
    version: true,
    resolvedAt: true,
    lastInteractionAt: true,
    createdAt: true,
    updatedAt: true,
    requester: {
      select: { id: true, name: true, companyName: true },
    },
    assignee: {
      select: { id: true, name: true },
    },
  } satisfies Prisma.TicketSelect;
}

export async function registerTicketRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
): Promise<void> {
  app.get('/api/tickets', { preHandler: [requireAuth(false)] }, async (request) => {
    const auth = request.auth!;
    const query = listTicketsQuerySchema.parse(request.query);
    const isRequester = auth.user.role === UserRole.REQUESTER;

    const baseRoleScope: Prisma.TicketWhereInput = isRequester ? { requesterId: auth.user.id } : {};
    const where: Prisma.TicketWhereInput = { ...baseRoleScope };

    if (query.status !== 'ALL') {
      where.status = query.status;
    }
    if (query.priority !== 'ALL') {
      where.priority = query.priority;
    }
    if (query.category !== 'ALL') {
      where.category = query.category;
    }

    if (!isRequester && query.assigneeId !== 'ALL') {
      if (query.assigneeId === 'UNASSIGNED') {
        where.assigneeId = null;
      } else if (query.assigneeId === 'MINE') {
        where.assigneeId = auth.user.id;
      } else {
        where.assigneeId = query.assigneeId;
      }
    }

    if (query.q && query.q.length > 0) {
      where.OR = [
        { code: { contains: query.q } },
        { subject: { contains: query.q } },
        { customerName: { contains: query.q } },
      ];
    }

    const skip = (query.page - 1) * query.pageSize;

    const [total, items, groupedStatuses] = await Promise.all([
      prisma.ticket.count({ where }),
      prisma.ticket.findMany({
        where,
        orderBy: [{ lastInteractionAt: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: query.pageSize,
        select: formatTicketSummarySelect(),
      }),
      prisma.ticket.groupBy({
        by: ['status'],
        where: baseRoleScope,
        _count: { _all: true },
      }),
    ]);

    const statusCounts: Record<TicketStatus, number> = {
      OPEN: 0,
      IN_PROGRESS: 0,
      WAITING_CUSTOMER: 0,
      RESOLVED: 0,
    };
    for (const row of groupedStatuses) {
      statusCounts[row.status] = row._count._all;
    }

    return {
      items,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
      statusCounts,
    };
  });

  app.post('/api/tickets', { preHandler: [requireAuth(true)] }, async (request, reply) => {
    const auth = request.auth!;
    const isRequester = auth.user.role === UserRole.REQUESTER;

    let subject: string;
    let category: TicketCategory;
    let priority: TicketPriority = TicketPriority.MEDIUM;
    let description: string;
    let requesterId = auth.user.id;
    let customerName = auth.user.companyName;

    if (isRequester) {
      const body = requesterCreateSchema.parse(request.body);
      subject = normalizePlainText(body.subject);
      category = body.category;
      description = normalizePlainText(body.description);
    } else {
      const body = staffCreateSchema.parse(request.body);
      subject = normalizePlainText(body.subject);
      category = body.category;
      priority = body.priority;
      description = normalizePlainText(body.description);
      if (body.requesterId) {
        const reqUser = await prisma.user.findUnique({
          where: { id: body.requesterId },
          select: { id: true, companyName: true, isActive: true },
        });
        if (!reqUser || !reqUser.isActive) {
          throw new AppError(400, 'INVALID_REQUESTER', 'Solicitante informado não está ativo.');
        }
        requesterId = reqUser.id;
        customerName = reqUser.companyName;
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const seq = await tx.ticketSequence.upsert({
        where: { id: 1 },
        create: { id: 1, lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
      });

      const code = `RET-${String(seq.lastNumber).padStart(4, '0')}`;
      const now = new Date();

      const ticket = await tx.ticket.create({
        data: {
          code,
          subject,
          customerName,
          status: TicketStatus.OPEN,
          priority,
          category,
          requesterId,
          assigneeId: null,
          lastInteractionAt: now,
          messages: {
            create: {
              authorId: auth.user.id,
              kind: MessageKind.MESSAGE,
              visibility: MessageVisibility.PUBLIC,
              body: description,
            },
          },
        },
        select: formatTicketSummarySelect(),
      });

      return ticket;
    });

    return reply.status(201).send({ ticket: created });
  });

  app.get('/api/tickets/:id', { preHandler: [requireAuth(false)] }, async (request) => {
    const auth = request.auth!;
    const { id } = ticketIdParamsSchema.parse(request.params);
    const isRequester = auth.user.role === UserRole.REQUESTER;

    const ticket = await prisma.ticket.findUnique({
      where: { id },
      select: {
        ...formatTicketSummarySelect(),
        requesterId: true,
        assigneeId: true,
        messages: {
          // Notas internas são filtradas diretamente na consulta para solicitantes.
          where: isRequester ? { visibility: MessageVisibility.PUBLIC } : undefined,
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            kind: true,
            visibility: true,
            body: true,
            createdAt: true,
            author: {
              select: { id: true, name: true, role: true },
            },
          },
        },
        drafts: {
          where: {
            userId: auth.user.id,
            ...(isRequester ? { visibility: MessageVisibility.PUBLIC } : {}),
          },
          select: {
            visibility: true,
            content: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!ticket) {
      throw new AppError(404, 'TICKET_NOT_FOUND', 'Chamado não encontrado.');
    }

    if (isRequester && ticket.requesterId !== auth.user.id) {
      throw new AppError(403, 'FORBIDDEN', 'Você só pode consultar os seus próprios chamados.');
    }

    return { ticket };
  });

  app.patch('/api/tickets/:id', { preHandler: [requireAuth(true)] }, async (request) => {
    const auth = request.auth!;
    if (auth.user.role === UserRole.REQUESTER) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Apenas atendentes e administradores alteram classificação e responsável.',
      );
    }

    const { id } = ticketIdParamsSchema.parse(request.params);
    const body = patchTicketSchema.parse(request.body);

    if (
      body.status === undefined &&
      body.priority === undefined &&
      body.category === undefined &&
      body.assigneeId === undefined
    ) {
      throw new AppError(400, 'EMPTY_UPDATE', 'Informe ao menos um campo para atualizar.');
    }

    let assigneeNameForEvent: string | null = null;
    if (body.assigneeId !== undefined && body.assigneeId !== null) {
      const agent = await prisma.user.findUnique({
        where: { id: body.assigneeId },
        select: { id: true, name: true, role: true, isActive: true },
      });
      if (!agent || !agent.isActive || agent.role === UserRole.REQUESTER) {
        throw new AppError(
          400,
          'INVALID_ASSIGNEE',
          'Responsável precisa ser atendente ou administrador ativo.',
        );
      }
      assigneeNameForEvent = agent.name;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const current = await tx.ticket.findUnique({
        where: { id },
        select: {
          id: true,
          version: true,
          status: true,
          priority: true,
          category: true,
          assigneeId: true,
          resolvedAt: true,
        },
      });

      if (!current) {
        throw new AppError(404, 'TICKET_NOT_FOUND', 'Chamado não encontrado.');
      }

      if (current.version !== body.expectedVersion) {
        throw new AppError(
          409,
          'VERSION_CONFLICT',
          'Este chamado foi alterado por outro usuário. Recarregue os dados antes de salvar.',
          { currentVersion: current.version },
        );
      }

      const now = new Date();
      const data: Prisma.TicketUncheckedUpdateManyInput = {
        version: { increment: 1 },
        lastInteractionAt: now,
      };

      const changes: string[] = [];

      if (body.status !== undefined && body.status !== current.status) {
        data.status = body.status;
        data.resolvedAt = body.status === TicketStatus.RESOLVED ? now : null;
        changes.push(`status para "${STATUS_LABELS[body.status]}"`);
      }
      if (body.priority !== undefined && body.priority !== current.priority) {
        data.priority = body.priority;
        changes.push(`prioridade para "${PRIORITY_LABELS[body.priority]}"`);
      }
      if (body.category !== undefined && body.category !== current.category) {
        data.category = body.category;
        changes.push(`categoria para "${CATEGORY_LABELS[body.category]}"`);
      }
      if (body.assigneeId !== undefined && body.assigneeId !== current.assigneeId) {
        data.assigneeId = body.assigneeId;
        changes.push(
          body.assigneeId
            ? `responsável para ${assigneeNameForEvent}`
            : 'responsável removido (não atribuído)',
        );
      }

      const lockUpdate = await tx.ticket.updateMany({
        where: { id: current.id, version: body.expectedVersion },
        data,
      });

      if (lockUpdate.count === 0) {
        throw new AppError(
          409,
          'VERSION_CONFLICT',
          'Conflito de concorrência detectado ao atualizar o chamado.',
        );
      }

      if (changes.length > 0) {
        await tx.ticketMessage.create({
          data: {
            ticketId: current.id,
            authorId: auth.user.id,
            kind: MessageKind.EVENT,
            visibility: MessageVisibility.PUBLIC,
            body: `${auth.user.name} alterou ${changes.join('; ')}.`,
          },
        });
      }

      return tx.ticket.findUniqueOrThrow({
        where: { id: current.id },
        select: formatTicketSummarySelect(),
      });
    });

    return { ticket: updated };
  });

  app.post(
    '/api/tickets/:id/messages',
    { preHandler: [requireAuth(true)] },
    async (request, reply) => {
      const auth = request.auth!;
      const { id } = ticketIdParamsSchema.parse(request.params);
      const body = createMessageSchema.parse(request.body);
      const isRequester = auth.user.role === UserRole.REQUESTER;

      if (isRequester && body.visibility === MessageVisibility.INTERNAL) {
        throw new AppError(403, 'FORBIDDEN', 'Solicitantes não têm acesso a notas internas.');
      }
      if (isRequester && body.nextStatus !== undefined) {
        throw new AppError(403, 'FORBIDDEN', 'Solicitantes não alteram o estágio de atendimento.');
      }

      const cleanBody = normalizePlainText(body.body);
      if (!cleanBody) {
        throw new AppError(400, 'EMPTY_MESSAGE', 'A mensagem não pode ficar em branco.');
      }

      const result = await prisma.$transaction(async (tx) => {
        const ticket = await tx.ticket.findUnique({
          where: { id },
          select: { id: true, requesterId: true, assigneeId: true, status: true, version: true },
        });

        if (!ticket) {
          throw new AppError(404, 'TICKET_NOT_FOUND', 'Chamado não encontrado.');
        }

        if (isRequester && ticket.requesterId !== auth.user.id) {
          throw new AppError(
            403,
            'FORBIDDEN',
            'Você só pode responder aos seus próprios chamados.',
          );
        }

        if (body.idempotencyKey) {
          const existing = await tx.ticketMessage.findFirst({
            where: {
              ticketId: ticket.id,
              authorId: auth.user.id,
              idempotencyKey: body.idempotencyKey,
            },
            select: {
              id: true,
              kind: true,
              visibility: true,
              body: true,
              createdAt: true,
              author: { select: { id: true, name: true, role: true } },
            },
          });

          if (existing) {
            return {
              message: existing,
              ticketVersion: ticket.version,
              status: ticket.status,
              deduplicated: true,
            };
          }
        }

        const message = await tx.ticketMessage.create({
          data: {
            ticketId: ticket.id,
            authorId: auth.user.id,
            kind: MessageKind.MESSAGE,
            visibility: body.visibility,
            body: cleanBody,
            idempotencyKey: body.idempotencyKey ?? null,
          },
          select: {
            id: true,
            kind: true,
            visibility: true,
            body: true,
            createdAt: true,
            author: { select: { id: true, name: true, role: true } },
          },
        });

        let nextTicketStatus = ticket.status;
        if (body.visibility === MessageVisibility.PUBLIC) {
          if (!isRequester && body.nextStatus) {
            nextTicketStatus = body.nextStatus;
          } else if (isRequester && ticket.status === TicketStatus.WAITING_CUSTOMER) {
            nextTicketStatus = ticket.assigneeId ? TicketStatus.IN_PROGRESS : TicketStatus.OPEN;
          } else if (!isRequester && ticket.status === TicketStatus.OPEN) {
            nextTicketStatus = TicketStatus.IN_PROGRESS;
          }
        }

        const now = new Date();
        const updatedTicket = await tx.ticket.update({
          where: { id: ticket.id },
          data: {
            status: nextTicketStatus,
            resolvedAt: nextTicketStatus === TicketStatus.RESOLVED ? undefined : null,
            lastInteractionAt: body.visibility === MessageVisibility.PUBLIC ? now : undefined,
            version: { increment: 1 },
          },
          select: { version: true, status: true },
        });

        await tx.ticketDraft.deleteMany({
          where: {
            ticketId: ticket.id,
            userId: auth.user.id,
            visibility: body.visibility,
          },
        });

        return {
          message,
          ticketVersion: updatedTicket.version,
          status: updatedTicket.status,
          deduplicated: false,
        };
      });

      return reply.status(result.deduplicated ? 200 : 201).send(result);
    },
  );

  app.post('/api/tickets/:id/resolve', { preHandler: [requireAuth(true)] }, async (request) => {
    const auth = request.auth!;
    const { id } = ticketIdParamsSchema.parse(request.params);
    const body = versionActionSchema.parse(request.body);
    const isRequester = auth.user.role === UserRole.REQUESTER;

    const updated = await prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.findUnique({
        where: { id },
        select: { id: true, requesterId: true, status: true, version: true },
      });
      if (!ticket) {
        throw new AppError(404, 'TICKET_NOT_FOUND', 'Chamado não encontrado.');
      }
      if (isRequester && ticket.requesterId !== auth.user.id) {
        throw new AppError(403, 'FORBIDDEN', 'Você só pode resolver os seus próprios chamados.');
      }
      if (ticket.version !== body.expectedVersion) {
        throw new AppError(
          409,
          'VERSION_CONFLICT',
          'Este chamado foi atualizado recentemente. Recarregue antes de resolver.',
          { currentVersion: ticket.version },
        );
      }
      if (ticket.status === TicketStatus.RESOLVED) {
        throw new AppError(400, 'ALREADY_RESOLVED', 'Este chamado já está marcado como resolvido.');
      }

      const now = new Date();
      const lockUpdate = await tx.ticket.updateMany({
        where: { id: ticket.id, version: body.expectedVersion },
        data: {
          status: TicketStatus.RESOLVED,
          resolvedAt: now,
          lastInteractionAt: now,
          version: { increment: 1 },
        },
      });
      if (lockUpdate.count === 0) {
        throw new AppError(409, 'VERSION_CONFLICT', 'Conflito ao resolver o chamado.');
      }

      await tx.ticketMessage.create({
        data: {
          ticketId: ticket.id,
          authorId: auth.user.id,
          kind: MessageKind.EVENT,
          visibility: MessageVisibility.PUBLIC,
          body: `Chamado marcado como resolvido por ${auth.user.name}.`,
        },
      });

      return tx.ticket.findUniqueOrThrow({
        where: { id: ticket.id },
        select: formatTicketSummarySelect(),
      });
    });

    return { ticket: updated };
  });

  app.post('/api/tickets/:id/reopen', { preHandler: [requireAuth(true)] }, async (request) => {
    const auth = request.auth!;
    const { id } = ticketIdParamsSchema.parse(request.params);
    const body = versionActionSchema.parse(request.body);
    const isRequester = auth.user.role === UserRole.REQUESTER;

    const updated = await prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.findUnique({
        where: { id },
        select: { id: true, requesterId: true, status: true, version: true },
      });
      if (!ticket) {
        throw new AppError(404, 'TICKET_NOT_FOUND', 'Chamado não encontrado.');
      }
      if (isRequester && ticket.requesterId !== auth.user.id) {
        throw new AppError(403, 'FORBIDDEN', 'Você só pode reabrir os seus próprios chamados.');
      }
      if (ticket.version !== body.expectedVersion) {
        throw new AppError(
          409,
          'VERSION_CONFLICT',
          'Este chamado foi atualizado recentemente. Recarregue antes de reabrir.',
          { currentVersion: ticket.version },
        );
      }
      if (ticket.status !== TicketStatus.RESOLVED) {
        throw new AppError(400, 'NOT_RESOLVED', 'Apenas chamados resolvidos podem ser reabertos.');
      }

      const now = new Date();
      const lockUpdate = await tx.ticket.updateMany({
        where: { id: ticket.id, version: body.expectedVersion },
        data: {
          status: TicketStatus.OPEN,
          resolvedAt: null,
          lastInteractionAt: now,
          version: { increment: 1 },
        },
      });
      if (lockUpdate.count === 0) {
        throw new AppError(409, 'VERSION_CONFLICT', 'Conflito ao reabrir o chamado.');
      }

      await tx.ticketMessage.create({
        data: {
          ticketId: ticket.id,
          authorId: auth.user.id,
          kind: MessageKind.EVENT,
          visibility: MessageVisibility.PUBLIC,
          body: `Chamado reaberto por ${auth.user.name}.`,
        },
      });

      return tx.ticket.findUniqueOrThrow({
        where: { id: ticket.id },
        select: formatTicketSummarySelect(),
      });
    });

    return { ticket: updated };
  });

  app.put('/api/tickets/:id/drafts', { preHandler: [requireAuth(true)] }, async (request) => {
    const auth = request.auth!;
    const { id } = ticketIdParamsSchema.parse(request.params);
    const body = saveDraftSchema.parse(request.body);
    const isRequester = auth.user.role === UserRole.REQUESTER;

    if (isRequester && body.visibility === MessageVisibility.INTERNAL) {
      throw new AppError(403, 'FORBIDDEN', 'Solicitantes não salvam rascunhos de nota interna.');
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id },
      select: { id: true, requesterId: true },
    });
    if (!ticket) {
      throw new AppError(404, 'TICKET_NOT_FOUND', 'Chamado não encontrado.');
    }
    if (isRequester && ticket.requesterId !== auth.user.id) {
      throw new AppError(403, 'FORBIDDEN', 'Sem permissão para salvar rascunho neste chamado.');
    }

    const content = normalizePlainText(body.content);
    if (!content) {
      await prisma.ticketDraft.deleteMany({
        where: { ticketId: ticket.id, userId: auth.user.id, visibility: body.visibility },
      });
      return { draft: null };
    }

    const draft = await prisma.ticketDraft.upsert({
      where: {
        ticketId_userId_visibility: {
          ticketId: ticket.id,
          userId: auth.user.id,
          visibility: body.visibility,
        },
      },
      create: {
        ticketId: ticket.id,
        userId: auth.user.id,
        visibility: body.visibility,
        content,
      },
      update: {
        content,
      },
      select: {
        visibility: true,
        content: true,
        updatedAt: true,
      },
    });

    return { draft };
  });

  app.delete('/api/tickets/:id/drafts', { preHandler: [requireAuth(true)] }, async (request) => {
    const auth = request.auth!;
    const { id } = ticketIdParamsSchema.parse(request.params);
    const { visibility } = deleteDraftQuerySchema.parse(request.query);
    const isRequester = auth.user.role === UserRole.REQUESTER;

    if (isRequester && visibility === MessageVisibility.INTERNAL) {
      throw new AppError(403, 'FORBIDDEN', 'Operação não permitida para este perfil.');
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id },
      select: { id: true, requesterId: true },
    });
    if (!ticket) {
      throw new AppError(404, 'TICKET_NOT_FOUND', 'Chamado não encontrado.');
    }
    if (isRequester && ticket.requesterId !== auth.user.id) {
      throw new AppError(403, 'FORBIDDEN', 'Sem permissão neste chamado.');
    }

    await prisma.ticketDraft.deleteMany({
      where: {
        ticketId: ticket.id,
        userId: auth.user.id,
        visibility,
      },
    });

    return { ok: true };
  });
}
