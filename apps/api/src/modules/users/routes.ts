import { UserRole, type PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import { hashPassword } from '../../lib/password.js';
import { normalizePlainText } from '../../lib/sanitize.js';
import { revokeAllUserSessions } from '../../lib/session.js';
import { requireRole } from '../../plugins/auth.js';

const createUserSchema = z
  .object({
    name: z.string().trim().min(2, 'Nome muito curto.').max(120),
    email: z.string().trim().email('E-mail inválido.').max(180),
    password: z.string().min(8, 'A senha precisa ter ao menos 8 caracteres.').max(200),
    role: z.nativeEnum(UserRole),
    companyName: z.string().trim().min(2, 'Informe a empresa ou equipe.').max(140),
  })
  .strict();

const updateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    role: z.nativeEnum(UserRole).optional(),
    companyName: z.string().trim().min(2).max(140).optional(),
    isActive: z.boolean().optional(),
    password: z.string().min(8).max(200).optional(),
  })
  .strict();

const userIdParamsSchema = z.object({
  id: z.string().trim().min(1).max(64),
});

export async function registerUserRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
): Promise<void> {
  // Lista compacta de atendentes/administradores ativos para atribuição de chamados
  app.get(
    '/api/agents',
    { preHandler: [requireRole([UserRole.AGENT, UserRole.ADMIN])] },
    async () => {
      const agents = await prisma.user.findMany({
        where: {
          isActive: true,
          role: { in: [UserRole.AGENT, UserRole.ADMIN] },
        },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          role: true,
        },
      });
      return { agents };
    },
  );

  // Lista de solicitantes para abertura de chamado por atendentes/administradores
  app.get(
    '/api/requesters',
    { preHandler: [requireRole([UserRole.AGENT, UserRole.ADMIN])] },
    async () => {
      const requesters = await prisma.user.findMany({
        where: {
          isActive: true,
          role: UserRole.REQUESTER,
        },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          companyName: true,
        },
      });
      return { requesters };
    },
  );

  app.get('/api/users', { preHandler: [requireRole([UserRole.ADMIN])] }, async () => {
    const users = await prisma.user.findMany({
      orderBy: [{ role: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        companyName: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return { users };
  });

  app.post(
    '/api/users',
    { preHandler: [requireRole([UserRole.ADMIN])] },
    async (request, reply) => {
      const body = createUserSchema.parse(request.body);
      const email = body.email.toLowerCase();

      const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (existing) {
        throw new AppError(409, 'EMAIL_EXISTS', 'Já existe uma conta cadastrada com este e-mail.');
      }

      const passwordHash = await hashPassword(body.password);
      const user = await prisma.user.create({
        data: {
          name: normalizePlainText(body.name),
          email,
          passwordHash,
          role: body.role,
          companyName: normalizePlainText(body.companyName),
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          companyName: true,
          isActive: true,
          createdAt: true,
        },
      });

      return reply.status(201).send({ user });
    },
  );

  app.patch('/api/users/:id', { preHandler: [requireRole([UserRole.ADMIN])] }, async (request) => {
    const { id } = userIdParamsSchema.parse(request.params);
    const body = updateUserSchema.parse(request.body);

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, isActive: true },
    });
    if (!target) {
      throw new AppError(404, 'USER_NOT_FOUND', 'Usuário não encontrado.');
    }

    const willDemoteAdmin =
      target.role === UserRole.ADMIN && body.role !== undefined && body.role !== UserRole.ADMIN;
    const willDeactivateAdmin =
      target.role === UserRole.ADMIN && target.isActive && body.isActive === false;

    if (willDemoteAdmin || willDeactivateAdmin) {
      const otherActiveAdmins = await prisma.user.count({
        where: {
          role: UserRole.ADMIN,
          isActive: true,
          id: { not: target.id },
        },
      });
      if (otherActiveAdmins === 0) {
        throw new AppError(
          400,
          'LAST_ADMIN',
          'Não é possível desativar ou rebaixar o único administrador ativo.',
        );
      }
    }

    const data: {
      name?: string;
      role?: UserRole;
      companyName?: string;
      isActive?: boolean;
      passwordHash?: string;
    } = {};

    if (body.name !== undefined) data.name = normalizePlainText(body.name);
    if (body.role !== undefined) data.role = body.role;
    if (body.companyName !== undefined) data.companyName = normalizePlainText(body.companyName);
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.password !== undefined) data.passwordHash = await hashPassword(body.password);

    const updated = await prisma.user.update({
      where: { id: target.id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        companyName: true,
        isActive: true,
        updatedAt: true,
      },
    });

    if (body.isActive === false || body.role !== undefined || body.password !== undefined) {
      await revokeAllUserSessions(prisma, target.id);
    }

    return { user: updated };
  });
}
