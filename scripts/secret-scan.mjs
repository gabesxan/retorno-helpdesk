import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.local',
  'dist',
  'build',
  'coverage',
  'playwright-report',
  'test-results',
]);

const IGNORE_FILES = new Set(['package-lock.json', 'secret-scan.mjs']);

const PATTERNS = [
  { name: 'Google AI / Gemini API Key', regex: /AIza[0-9A-Za-z_-]{30,}/g },
  { name: 'Private Key PEM', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/g },
  {
    name: 'Bearer JWT literal',
    regex: /Bearer\s+eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  },
  {
    name: 'Hardcoded GEMINI_API_KEY assignment',
    regex: /GEMINI_API_KEY\s*[:=]\s*["'](?!CHANGE_ME|<|example|DUMMY_|$)[A-Za-z0-9_-]{16,}["']/g,
  },
];

const findings = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (IGNORE_DIRS.has(entry)) continue;
    const fullPath = join(dir, entry);
    const st = statSync(fullPath);
    if (st.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (IGNORE_FILES.has(entry)) continue;
    if (entry.endsWith('.png') || entry.endsWith('.jpg') || entry.endsWith('.woff2')) continue;
    if (st.size > 1024 * 1024) continue;

    const rel = relative(ROOT, fullPath);
    if (rel === '.env' || rel.startsWith('.env.local')) continue;

    const text = readFileSync(fullPath, 'utf8');
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] ?? '';
      for (const pat of PATTERNS) {
        pat.regex.lastIndex = 0;
        if (pat.regex.test(line)) {
          findings.push({
            file: rel,
            line: i + 1,
            rule: pat.name,
          });
        }
      }
    }
  }
}

walk(ROOT);

if (findings.length > 0) {
  console.error('Secret scan failed with potential findings:');
  for (const f of findings) {
    console.error(`- ${f.file}:${f.line} [${f.rule}]`);
  }
  process.exit(1);
}

console.log('Secret scan passed: 0 real secret patterns detected.');
