import { buildApp } from './app.js';
import { parseEnv } from './config/env.js';

async function main(): Promise<void> {
  const env = parseEnv();
  const { app } = await buildApp({
    env,
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'warn',
      redact: ['req.headers.cookie', 'req.headers["x-csrf-token"]', 'res.headers["set-cookie"]'],
    },
  });

  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await app.listen({
    host: env.API_HOST,
    port: env.API_PORT,
  });

  console.log(`RETORNO API escutando em http://${env.API_HOST}:${env.API_PORT}`);
}

main().catch((err) => {
  console.error('Falha ao iniciar servidor RETORNO API:', err instanceof Error ? err.message : err);
  process.exit(1);
});
