import { Prisma, TicketCategory, type PrismaClient } from '@prisma/client';

export interface ArticleSearchRow {
  id: string;
  slug: string;
  title: string;
  category: TicketCategory;
  summary: string;
  tags: string;
  bodyMarkdown: string;
  isPublished: boolean;
  updatedAt: Date;
  score: number;
}

const SHORT_DOMAIN_TERMS = new Set(['pdv', 'tef', 'usb', 'nf', 'ip', 'nfe', 'sat', 'csc', 'xml']);

const PT_STOPWORDS = new Set([
  'para',
  'com',
  'sem',
  'nao',
  'não',
  'uma',
  'mais',
  'como',
  'esta',
  'está',
  'esse',
  'essa',
  'apos',
  'após',
  'pelo',
  'pela',
  'dos',
  'das',
  'nos',
  'nas',
  'entre',
  'deixou',
  'sobre',
  'cliente',
  'sistema',
  'modulo',
  'tentando',
  'aparece',
  'nenhuma',
  'algum',
  'muito',
]);

export function extractSearchTokens(rawQuery: string): string[] {
  const tokens = rawQuery
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter((t) => (t.length >= 3 || SHORT_DOMAIN_TERMS.has(t)) && !PT_STOPWORDS.has(t));

  return [...new Set(tokens)].slice(0, 6);
}

export async function searchKnowledgeArticles(
  prisma: PrismaClient,
  params: {
    query?: string;
    category?: TicketCategory;
    onlyPublished: boolean;
    limit?: number;
  },
): Promise<ArticleSearchRow[]> {
  const limit = Math.min(Math.max(params.limit ?? 12, 1), 30);
  const rawQuery = params.query?.trim() ?? '';

  if (!rawQuery) {
    const articles = await prisma.knowledgeArticle.findMany({
      where: {
        ...(params.onlyPublished ? { isPublished: true } : {}),
        ...(params.category ? { category: params.category } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        slug: true,
        title: true,
        category: true,
        summary: true,
        tags: true,
        bodyMarkdown: true,
        isPublished: true,
        updatedAt: true,
      },
    });
    return articles.map((a) => ({ ...a, score: 1 }));
  }

  const tokens = extractSearchTokens(rawQuery);
  const ftQuery = tokens.length > 0 ? tokens.join(' ') : rawQuery;

  const whereParts: Prisma.Sql[] = [];
  if (params.onlyPublished) {
    whereParts.push(Prisma.sql`isPublished = true`);
  }
  if (params.category) {
    whereParts.push(Prisma.sql`category = ${params.category}`);
  }

  const likeConditions: Prisma.Sql[] = [];
  const searchTerms = tokens.length > 0 ? tokens : [rawQuery];
  for (const term of searchTerms) {
    const pattern = `%${term}%`;
    likeConditions.push(
      Prisma.sql`(LOWER(title) LIKE ${pattern} OR LOWER(summary) LIKE ${pattern} OR LOWER(tags) LIKE ${pattern} OR LOWER(bodyMarkdown) LIKE ${pattern})`,
    );
  }

  const matchSql = Prisma.sql`MATCH(title, summary, tags, bodyMarkdown) AGAINST (${ftQuery} IN NATURAL LANGUAGE MODE)`;
  const matchOrLike =
    likeConditions.length > 0
      ? Prisma.sql`(${matchSql} > 0 OR ${Prisma.join(likeConditions, ' OR ')})`
      : Prisma.sql`${matchSql} > 0`;

  whereParts.push(matchOrLike);

  // Pontuação combinada: FULLTEXT nativo do MySQL + acerto exato em títulos/tags (para siglas como PDV, TEF, USB)
  const tokenBonusSql =
    likeConditions.length > 0
      ? Prisma.join(
          searchTerms.map((term) => {
            const pattern = `%${term}%`;
            return Prisma.sql`(CASE WHEN LOWER(title) LIKE ${pattern} THEN 2.0 WHEN LOWER(tags) LIKE ${pattern} THEN 1.5 WHEN LOWER(summary) LIKE ${pattern} THEN 1.0 WHEN LOWER(bodyMarkdown) LIKE ${pattern} THEN 0.5 ELSE 0 END)`;
          }),
          ' + ',
        )
      : Prisma.sql`0`;

  const rows = await prisma.$queryRaw<ArticleSearchRow[]>(Prisma.sql`
    SELECT
      id,
      slug,
      title,
      category,
      summary,
      tags,
      bodyMarkdown,
      isPublished,
      updatedAt,
      (${matchSql} + ${tokenBonusSql}) AS score
    FROM knowledge_articles
    WHERE ${Prisma.join(whereParts, ' AND ')}
    ORDER BY score DESC, updatedAt DESC
    LIMIT ${limit}
  `);

  return rows.map((row) => ({
    ...row,
    isPublished: Boolean(row.isPublished),
    score: Number(row.score),
  }));
}
