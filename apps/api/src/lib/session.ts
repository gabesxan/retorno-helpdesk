import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { PrismaClient, UserRole } from '@prisma/client';

export interface AuthenticatedSession {
  sessionId: string;
  csrfSecret: string;
  expiresAt: Date;
  user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    companyName: string;
    isActive: boolean;
  };
}

export function hashSessionToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

export function generateSessionSecrets(): {
  rawToken: string;
  tokenHash: string;
  csrfSecret: string;
} {
  const rawToken = randomBytes(32).toString('base64url');
  const tokenHash = hashSessionToken(rawToken);
  const csrfSecret = randomBytes(32).toString('hex');
  return { rawToken, tokenHash, csrfSecret };
}

export function verifyCsrfToken(expected: string, provided: string | undefined): boolean {
  if (!provided || expected.length !== provided.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(provided, 'utf8'));
}

export async function createSession(
  prisma: PrismaClient,
  params: {
    userId: string;
    ttlHours: number;
    userAgent?: string;
    ipAddress?: string;
  },
): Promise<{ rawToken: string; csrfSecret: string; expiresAt: Date; sessionId: string }> {
  const { rawToken, tokenHash, csrfSecret } = generateSessionSecrets();
  const expiresAt = new Date(Date.now() + params.ttlHours * 60 * 60 * 1000);

  const session = await prisma.session.create({
    data: {
      userId: params.userId,
      tokenHash,
      csrfSecret,
      expiresAt,
      userAgent: params.userAgent?.slice(0, 250) ?? null,
      ipAddress: params.ipAddress?.slice(0, 60) ?? null,
    },
    select: {
      id: true,
      expiresAt: true,
    },
  });

  return {
    rawToken,
    csrfSecret,
    expiresAt: session.expiresAt,
    sessionId: session.id,
  };
}

export async function resolveActiveSession(
  prisma: PrismaClient,
  rawToken: string | undefined,
): Promise<AuthenticatedSession | null> {
  if (!rawToken || rawToken.length < 20) {
    return null;
  }

  const tokenHash = hashSessionToken(rawToken);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      csrfSecret: true,
      expiresAt: true,
      revokedAt: true,
      lastSeenAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          companyName: true,
          isActive: true,
        },
      },
    },
  });

  if (!session) return null;
  if (session.revokedAt !== null) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;
  if (!session.user.isActive) return null;

  // Atualiza lastSeenAt no máximo a cada 60 segundos para evitar contenção de escrita
  if (Date.now() - session.lastSeenAt.getTime() > 60_000) {
    prisma.session
      .update({
        where: { id: session.id },
        data: { lastSeenAt: new Date() },
      })
      .catch(() => {
        // Atualização de auditoria best-effort
      });
  }

  return {
    sessionId: session.id,
    csrfSecret: session.csrfSecret,
    expiresAt: session.expiresAt,
    user: session.user,
  };
}

export async function revokeSessionById(prisma: PrismaClient, sessionId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserSessions(prisma: PrismaClient, userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
