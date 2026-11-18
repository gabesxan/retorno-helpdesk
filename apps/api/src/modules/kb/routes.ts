import { TicketCategory, UserRole, type PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import { normalizePlainText, stripControlCharacters } from '../../lib/sanitize.js';
import { requireRole } from '../../plugins/auth.js';
import { searchKnowledgeArticles } from './search.js';

const listKbQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  category: z.union([z.nativeEnum(TicketCategory), z.literal('ALL')]).default('ALL'),
  includeUnpublished: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

const createArticleSchema = z
  .object({
    title: z.string().trim().min(5, 'Título muito curto.').max(180),
    slug: z
      .string()
      .trim()
      .min(3)
      .max(160)
      .regex(/^[a-z0-9-]+$/, 'Slug deve conter apenas letras minúsculas, números e hífens.')
      .optional(),
    category: z.nativeEnum(TicketCategory),
    summary: z.string().trim().min(10, 'Resumo muito curto.').max(400),
    tags: z.string().trim().min(2).max(255),
    bodyMarkdown: z.string().trim().min(20, 'Conteúdo muito curto.').max(40000),
    isPublished: z.boolean().default(true),
  })
  .strict();

const updateArticleSchema = z
  .object({
    title: z.string().trim().min(5).max(180).optional(),
    category: z.nativeEnum(TicketCategory).optional(),
    summary: z.string().trim().min(10).max(400).optional(),
    tags: z.string().trim().min(2).max(255).optional(),
    bodyMarkdown: z.string().trim().min(20).max(40000).optional(),
    isPublished: z.boolean().optional(),
  })
  .strict();

const slugOrIdParamsSchema = z.object({
  slugOrId: z.string().trim().min(1).max(160),
});

const articleIdParamsSchema = z.object({
  id: z.string().trim().min(1).max(64),
});

function toSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140);
}

export async function registerKbRoutes(app: FastifyInstance, prisma: PrismaClient): Promise<void> {
  app.get(
    '/api/kb/articles',
    { preHandler: [requireRole([UserRole.AGENT, UserRole.ADMIN])] },
    async (request) => {
      const auth = request.auth!;
      const query = listKbQuerySchema.parse(request.query);
      const onlyPublished = auth.user.role !== UserRole.ADMIN || !query.includeUnpublished;

      const articles = await searchKnowledgeArticles(prisma, {
        query: query.q,
        category: query.category === 'ALL' ? undefined : query.category,
        onlyPublished,
        limit: 30,
      });

      return { articles };
    },
  );

  app.get(
    '/api/kb/articles/:slugOrId',
    { preHandler: [requireRole([UserRole.AGENT, UserRole.ADMIN])] },
    async (request) => {
      const auth = request.auth!;
      const { slugOrId } = slugOrIdParamsSchema.parse(request.params);

      const article = await prisma.knowledgeArticle.findFirst({
        where: {
          OR: [{ slug: slugOrId }, { id: slugOrId }],
          ...(auth.user.role !== UserRole.ADMIN ? { isPublished: true } : {}),
        },
        select: {
          id: true,
          slug: true,
          title: true,
          category: true,
          summary: true,
          tags: true,
          bodyMarkdown: true,
          isPublished: true,
          createdAt: true,
          updatedAt: true,
          author: { select: { id: true, name: true } },
        },
      });

      if (!article) {
        throw new AppError(
          404,
          'ARTICLE_NOT_FOUND',
          'Artigo não encontrado na base de conhecimento.',
        );
      }

      return { article };
    },
  );

  app.post(
    '/api/kb/articles',
    { preHandler: [requireRole([UserRole.ADMIN])] },
    async (request, reply) => {
      const auth = request.auth!;
      const body = createArticleSchema.parse(request.body);
      const slug = body.slug ?? toSlug(body.title);

      if (slug.length < 3) {
        throw new AppError(400, 'INVALID_SLUG', 'Não foi possível gerar um slug válido.');
      }

      const existing = await prisma.knowledgeArticle.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (existing) {
        throw new AppError(
          409,
          'SLUG_EXISTS',
          'Já existe um artigo publicado com este identificador.',
        );
      }

      const article = await prisma.knowledgeArticle.create({
        data: {
          slug,
          title: normalizePlainText(body.title),
          category: body.category,
          summary: normalizePlainText(body.summary),
          tags: normalizePlainText(body.tags),
          bodyMarkdown: stripControlCharacters(body.bodyMarkdown).trim(),
          isPublished: body.isPublished,
          authorId: auth.user.id,
        },
        select: {
          id: true,
          slug: true,
          title: true,
          category: true,
          summary: true,
          tags: true,
          bodyMarkdown: true,
          isPublished: true,
          createdAt: true,
          updatedAt: true,
          author: { select: { id: true, name: true } },
        },
      });

      return reply.status(201).send({ article });
    },
  );

  app.patch(
    '/api/kb/articles/:id',
    { preHandler: [requireRole([UserRole.ADMIN])] },
    async (request) => {
      const { id } = articleIdParamsSchema.parse(request.params);
      const body = updateArticleSchema.parse(request.body);

      const existing = await prisma.knowledgeArticle.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!existing) {
        throw new AppError(404, 'ARTICLE_NOT_FOUND', 'Artigo não encontrado.');
      }

      const data: {
        title?: string;
        category?: TicketCategory;
        summary?: string;
        tags?: string;
        bodyMarkdown?: string;
        isPublished?: boolean;
      } = {};

      if (body.title !== undefined) data.title = normalizePlainText(body.title);
      if (body.category !== undefined) data.category = body.category;
      if (body.summary !== undefined) data.summary = normalizePlainText(body.summary);
      if (body.tags !== undefined) data.tags = normalizePlainText(body.tags);
      if (body.bodyMarkdown !== undefined) {
        data.bodyMarkdown = stripControlCharacters(body.bodyMarkdown).trim();
      }
      if (body.isPublished !== undefined) data.isPublished = body.isPublished;

      const article = await prisma.knowledgeArticle.update({
        where: { id },
        data,
        select: {
          id: true,
          slug: true,
          title: true,
          category: true,
          summary: true,
          tags: true,
          bodyMarkdown: true,
          isPublished: true,
          createdAt: true,
          updatedAt: true,
          author: { select: { id: true, name: true } },
        },
      });

      return { article };
    },
  );
}
