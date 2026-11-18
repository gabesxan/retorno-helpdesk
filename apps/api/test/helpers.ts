import {
  MessageKind,
  MessageVisibility,
  TicketCategory,
  TicketPriority,
  TicketStatus,
  UserRole,
  type PrismaClient,
} from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { parseEnv, type AppEnv } from '../src/config/env.js';
import { hashPassword } from '../src/lib/password.js';
import { createPrismaClient } from '../src/lib/prisma.js';

export const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  'mysql://retorno_test:retorno_test_local_pass@127.0.0.1:33307/retorno_test';

export function createTestPrisma(): PrismaClient {
  const parsed = new URL(TEST_DB_URL);
  if (parsed.pathname.replace(/^\//, '') !== 'retorno_test') {
    throw new Error('Testes de integração só podem rodar no banco isolado retorno_test.');
  }
  return createPrismaClient(TEST_DB_URL);
}

export function createTestEnv(overrides?: Partial<AppEnv>): AppEnv {
  const base = parseEnv({
    NODE_ENV: 'test',
    API_HOST: '127.0.0.1',
    API_PORT: '3349',
    DATABASE_URL: TEST_DB_URL,
    CORS_ORIGIN: 'http://127.0.0.1:4178,http://localhost:4178',
    SESSION_COOKIE_NAME: 'retorno_sid',
    SESSION_TTL_HOURS: '12',
    COOKIE_SECURE: 'false',
    AI_ALLOW_SIMULATED_FALLBACK: 'true',
    GEMINI_API_KEY: '',
  });
  return { ...base, ...overrides };
}

export interface TestFixtures {
  admin: { id: string; email: string };
  agent: { id: string; email: string };
  requesterA: { id: string; email: string };
  requesterB: { id: string; email: string };
  inactiveUser: { id: string; email: string };
  ticketAId: string;
  ticketBId: string;
  ticketUndocumentedId: string;
  publishedPrinterArticleId: string;
  draftArticleId: string;
  password: string;
}

export async function resetTestDatabase(prisma: PrismaClient): Promise<TestFixtures> {
  await prisma.$transaction(async (tx) => {
    await tx.ticketDraft.deleteMany();
    await tx.ticketMessage.deleteMany();
    await tx.ticket.deleteMany();
    await tx.ticketSequence.deleteMany();
    await tx.knowledgeArticle.deleteMany();
    await tx.session.deleteMany();
    await tx.user.deleteMany();
  });

  const password = 'TestPassword!2026';
  const pwHash = await hashPassword(password);

  const admin = await prisma.user.create({
    data: {
      name: 'Helena Admin',
      email: 'helena@test.local',
      passwordHash: pwHash,
      role: UserRole.ADMIN,
      companyName: 'Equipe Retorno',
      isActive: true,
    },
  });

  const agent = await prisma.user.create({
    data: {
      name: 'Lucas Atendente',
      email: 'lucas@test.local',
      passwordHash: pwHash,
      role: UserRole.AGENT,
      companyName: 'Equipe Retorno',
      isActive: true,
    },
  });

  const requesterA = await prisma.user.create({
    data: {
      name: 'Rafael Loja A',
      email: 'loja.a@test.local',
      passwordHash: pwHash,
      role: UserRole.REQUESTER,
      companyName: 'Mercado Alpha',
      isActive: true,
    },
  });

  const requesterB = await prisma.user.create({
    data: {
      name: 'Patrícia Loja B',
      email: 'loja.b@test.local',
      passwordHash: pwHash,
      role: UserRole.REQUESTER,
      companyName: 'Farmácia Beta',
      isActive: true,
    },
  });

  const inactiveUser = await prisma.user.create({
    data: {
      name: 'Usuário Inativo',
      email: 'inativo@test.local',
      passwordHash: pwHash,
      role: UserRole.REQUESTER,
      companyName: 'Loja Inativa',
      isActive: false,
    },
  });

  const printerArticle = await prisma.knowledgeArticle.create({
    data: {
      slug: 'impressora-usb-caixa-teste',
      title: 'Impressora térmica do caixa não imprime via USB',
      category: TicketCategory.PRINTER_HARDWARE,
      summary: 'Verificação da porta COM/USB e limpeza do spooler da impressora do caixa.',
      tags: 'impressora, caixa, usb, spooler, pdv',
      bodyMarkdown:
        '## Passos\n1. Faça o autoteste segurando FEED.\n2. Confira a porta COM no Configurador PDV.',
      isPublished: true,
      authorId: admin.id,
    },
  });

  await prisma.knowledgeArticle.create({
    data: {
      slug: 'tef-pinpad-teste',
      title: 'Pinpad e TEF sem comunicação no cartão',
      category: TicketCategory.FISCAL_POS,
      summary: 'Reinício do serviço TEF e conferência da porta serial.',
      tags: 'tef, pinpad, pdv, cartao',
      bodyMarkdown: 'Reinicie o Agente TEF Local e reconecte o USB do pinpad.',
      isPublished: true,
      authorId: admin.id,
    },
  });

  const draftArticle = await prisma.knowledgeArticle.create({
    data: {
      slug: 'rascunho-interno-teste',
      title: 'Procedimento rascunho não publicado',
      category: TicketCategory.OTHER,
      summary: 'Artigo em revisão ainda não publicado para atendentes.',
      tags: 'rascunho, interno',
      bodyMarkdown: 'Conteúdo em rascunho.',
      isPublished: false,
      authorId: admin.id,
    },
  });

  const ticketA = await prisma.ticket.create({
    data: {
      code: 'RET-0001',
      subject: 'Impressora do caixa deixou de funcionar',
      customerName: requesterA.companyName,
      status: TicketStatus.OPEN,
      priority: TicketPriority.HIGH,
      category: TicketCategory.PRINTER_HARDWARE,
      requesterId: requesterA.id,
      assigneeId: agent.id,
      messages: {
        create: [
          {
            authorId: requesterA.id,
            kind: MessageKind.MESSAGE,
            visibility: MessageVisibility.PUBLIC,
            body: 'A impressora térmica USB do caixa 01 parou de imprimir após reiniciar o PC.',
          },
          {
            authorId: agent.id,
            kind: MessageKind.MESSAGE,
            visibility: MessageVisibility.INTERNAL,
            body: 'SEGREDO_NOTA_INTERNA_XYZ: verificar possível defeito na porta USB traseira.',
          },
        ],
      },
    },
  });

  const ticketB = await prisma.ticket.create({
    data: {
      code: 'RET-0002',
      subject: 'Divergência entre estoque e relatório',
      customerName: requesterB.companyName,
      status: TicketStatus.IN_PROGRESS,
      priority: TicketPriority.MEDIUM,
      category: TicketCategory.INVENTORY_REPORTS,
      requesterId: requesterB.id,
      assigneeId: agent.id,
      messages: {
        create: [
          {
            authorId: requesterB.id,
            kind: MessageKind.MESSAGE,
            visibility: MessageVisibility.PUBLIC,
            body: 'Saldo de estoque diverge do relatório de fechamento diário.',
          },
        ],
      },
    },
  });

  const ticketUndocumented = await prisma.ticket.create({
    data: {
      code: 'RET-0003',
      subject: 'Coletor RFID Zebra RFD40 sem driver no inventário',
      customerName: requesterA.companyName,
      status: TicketStatus.OPEN,
      priority: TicketPriority.MEDIUM,
      category: TicketCategory.OTHER,
      requesterId: requesterA.id,
      messages: {
        create: [
          {
            authorId: requesterA.id,
            kind: MessageKind.MESSAGE,
            visibility: MessageVisibility.PUBLIC,
            body: 'Tentando parear coletor UHF Zebra RFD40 no módulo móvel.',
          },
        ],
      },
    },
  });

  await prisma.ticketSequence.create({ data: { id: 1, lastNumber: 3 } });

  return {
    admin: { id: admin.id, email: admin.email },
    agent: { id: agent.id, email: agent.email },
    requesterA: { id: requesterA.id, email: requesterA.email },
    requesterB: { id: requesterB.id, email: requesterB.email },
    inactiveUser: { id: inactiveUser.id, email: inactiveUser.email },
    ticketAId: ticketA.id,
    ticketBId: ticketB.id,
    ticketUndocumentedId: ticketUndocumented.id,
    publishedPrinterArticleId: printerArticle.id,
    draftArticleId: draftArticle.id,
    password,
  };
}

export async function loginAs(
  app: FastifyInstance,
  email: string,
  password: string,
): Promise<{
  cookieHeader: string;
  csrfToken: string;
  user: { id: string; name: string; email: string; role: UserRole };
}> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password },
  });

  if (res.statusCode !== 200) {
    throw new Error(`Falha ao autenticar ${email} no teste: ${res.statusCode} ${res.body}`);
  }

  const rawCookie = res.headers['set-cookie'];
  const cookieLine = Array.isArray(rawCookie) ? rawCookie[0] : rawCookie;
  if (!cookieLine) {
    throw new Error('Cookie retorno_sid ausente na resposta de login.');
  }

  const cookiePair = cookieLine.split(';')[0] ?? '';
  const body = res.json() as {
    csrfToken: string;
    user: { id: string; name: string; email: string; role: UserRole };
  };

  return {
    cookieHeader: cookiePair,
    csrfToken: body.csrfToken,
    user: body.user,
  };
}
