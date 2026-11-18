import { createDB } from 'mysql-memory-server';
import mysql from 'mysql2/promise';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// Remove diretórios do PATH que contenham um mysqld de sistema quebrado para forçar
// download e execução do binário isolado MySQL 8.4 do mysql-memory-server.
if (process.env.PATH) {
  process.env.PATH = process.env.PATH.split(':')
    .filter((dir) => !existsSync(join(dir, 'mysqld')))
    .join(':');
}

const LOCAL_DIR = join(process.cwd(), '.local');
const PID_FILE = join(LOCAL_DIR, 'mysql-local.pid');
const STATUS_FILE = join(LOCAL_DIR, 'mysql-local.json');

const DEV_CONFIG = {
  port: 33306,
  dbName: 'retorno_dev',
  user: 'retorno_app',
  password: 'retorno_dev_local_pass',
};

const TEST_CONFIG = {
  port: 33307,
  dbName: 'retorno_test',
  user: 'retorno_test',
  password: 'retorno_test_local_pass',
};

async function canConnect(cfg) {
  try {
    const conn = await mysql.createConnection({
      host: '127.0.0.1',
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: cfg.dbName,
      connectTimeout: 1500,
    });
    await conn.query('SELECT 1');
    await conn.end();
    return true;
  } catch {
    return false;
  }
}

async function startEmbeddedInstance(cfg) {
  const initSQLString = [
    `CREATE DATABASE IF NOT EXISTS \`${cfg.dbName}\`;`,
    `CREATE USER IF NOT EXISTS '${cfg.user}'@'127.0.0.1' IDENTIFIED BY '${cfg.password}';`,
    `CREATE USER IF NOT EXISTS '${cfg.user}'@'localhost' IDENTIFIED BY '${cfg.password}';`,
    `GRANT ALL PRIVILEGES ON \`${cfg.dbName}\`.* TO '${cfg.user}'@'127.0.0.1';`,
    `GRANT ALL PRIVILEGES ON \`${cfg.dbName}\`.* TO '${cfg.user}'@'localhost';`,
    `FLUSH PRIVILEGES;`,
  ].join('\n');

  const db = await createDB({
    version: '8.4.x',
    port: cfg.port,
    dbName: cfg.dbName,
    username: 'root',
    xEnabled: 'OFF',
    downloadBinaryOnce: true,
    initSQLString,
  });

  return db;
}

const command = process.argv[2] ?? 'ensure';

if (command === 'ensure') {
  const devOk = await canConnect(DEV_CONFIG);
  const testOk = await canConnect(TEST_CONFIG);
  console.log(
    JSON.stringify({
      dev: { port: DEV_CONFIG.port, dbName: DEV_CONFIG.dbName, ready: devOk },
      test: { port: TEST_CONFIG.port, dbName: TEST_CONFIG.dbName, ready: testOk },
    }),
  );
  process.exit(devOk && testOk ? 0 : 1);
}

if (command === 'start') {
  mkdirSync(LOCAL_DIR, { recursive: true });
  const devAlready = await canConnect(DEV_CONFIG);
  const testAlready = await canConnect(TEST_CONFIG);

  if (devAlready && testAlready) {
    console.log('MySQL dev (33306) e test (33307) já estão ativos.');
    process.exit(0);
  }

  const running = [];
  if (!devAlready) {
    console.log('Iniciando MySQL isolado dev em 127.0.0.1:33306 (retorno_dev)...');
    running.push(await startEmbeddedInstance(DEV_CONFIG));
  }
  if (!testAlready) {
    console.log('Iniciando MySQL isolado test em 127.0.0.1:33307 (retorno_test)...');
    running.push(await startEmbeddedInstance(TEST_CONFIG));
  }

  writeFileSync(PID_FILE, String(process.pid), 'utf8');
  writeFileSync(
    STATUS_FILE,
    JSON.stringify(
      {
        pid: process.pid,
        startedAt: new Date().toISOString(),
        devPort: DEV_CONFIG.port,
        testPort: TEST_CONFIG.port,
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log('MySQL isolado pronto em 127.0.0.1:33306 (dev) e 127.0.0.1:33307 (test).');

  const shutdown = async () => {
    for (const instance of running) {
      try {
        await instance.stop();
      } catch {
        // Ignora erro no desligamento
      }
    }
    if (existsSync(PID_FILE)) rmSync(PID_FILE, { force: true });
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Mantém o daemon vivo até receber sinal
  setInterval(() => {}, 60_000);
} else if (command === 'stop') {
  if (existsSync(PID_FILE)) {
    const pid = Number(readFileSync(PID_FILE, 'utf8').trim());
    if (Number.isInteger(pid) && pid > 0) {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        // Processo já finalizado
      }
    }
    rmSync(PID_FILE, { force: true });
  }
} else {
  console.error(`Comando desconhecido: ${command}. Use: start | ensure | stop`);
  process.exit(1);
}
