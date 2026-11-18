import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

function loadEnvFromAncestors(): void {
  const startDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(startDir, '../../.env'),
    resolve(startDir, '../../../../.env'),
    resolve(process.cwd(), '.env'),
  ];

  for (const file of candidates) {
    if (!existsSync(file)) continue;
    const raw = readFileSync(file, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
    break;
  }
}

loadEnvFromAncestors();

const boolSchema = z.union([z.boolean(), z.string()]).transform((val) => {
  if (typeof val === 'boolean') return val;
  return val.trim().toLowerCase() === 'true';
});

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().trim().min(1).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3340),
  DATABASE_URL: z.string().trim().min(1),
  CORS_ORIGIN: z.string().default('http://127.0.0.1:4178,http://localhost:4178'),
  SESSION_COOKIE_NAME: z.string().trim().min(1).default('retorno_sid'),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(12),
  COOKIE_SECURE: boolSchema.default(false),
  GEMINI_API_KEY: z
    .string()
    .optional()
    .transform((v) => {
      const trimmed = v?.trim();
      return trimmed && trimmed.length > 0 ? trimmed : undefined;
    }),
  GEMINI_MODEL: z.string().trim().min(1).default('gemini-2.5-flash'),
  AI_ALLOW_SIMULATED_FALLBACK: boolSchema.default(false),
  AI_MAX_INPUT_CHARS: z.coerce.number().int().min(500).max(12000).default(4000),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(128).max(2048).default(900),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(12000),
  AI_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).max(60).default(6),
  AI_MAX_CONCURRENT_PER_USER: z.coerce.number().int().min(1).max(10).default(2),
  AI_MAX_CONCURRENT_GLOBAL: z.coerce.number().int().min(1).max(20).default(5),
});

export type AppEnv = Omit<z.infer<typeof envSchema>, 'CORS_ORIGIN'> & {
  corsOrigins: string[];
};

export function parseEnv(rawEnv: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = envSchema.parse(rawEnv);
  const corsOrigins = parsed.CORS_ORIGIN.split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  return {
    ...parsed,
    COOKIE_SECURE: parsed.NODE_ENV === 'production' ? true : parsed.COOKIE_SECURE,
    AI_ALLOW_SIMULATED_FALLBACK:
      parsed.NODE_ENV === 'production' ? false : parsed.AI_ALLOW_SIMULATED_FALLBACK,
    corsOrigins,
  };
}
