import DOMPurify from 'dompurify';
import { Marked, type Tokens } from 'marked';

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'b',
  'i',
  'code',
  'pre',
  'ul',
  'ol',
  'li',
  'blockquote',
  'h1',
  'h2',
  'h3',
  'h4',
  'a',
  'hr',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
];

const ALLOWED_ATTR = ['href', 'title', 'target', 'rel'];

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function isSafeHref(rawHref: string): boolean {
  const trimmed = rawHref.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('#')) return true;
  if (trimmed.startsWith('/')) return !trimmed.startsWith('//');

  try {
    const parsed = new URL(trimmed);
    return (
      parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:'
    );
  } catch {
    return false;
  }
}

const safeMarked = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    html({ text }: Tokens.HTML | Tokens.Tag): string {
      // Escapa qualquer HTML embutido em Markdown para impedir tags arbitrárias.
      return escapeHtml(text);
    },
  },
});

let hookRegistered = false;

function ensurePurifyHooks(): void {
  if (hookRegistered) return;
  hookRegistered = true;

  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') ?? '';
      if (!isSafeHref(href)) {
        node.removeAttribute('href');
        node.removeAttribute('target');
        node.setAttribute('rel', 'nofollow');
      } else if (href.startsWith('http://') || href.startsWith('https://')) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    }
  });
}

export function renderSafeMarkdown(markdown: string): string {
  ensurePurifyHooks();
  const parsedHtml = safeMarked.parse(markdown, { async: false });
  return DOMPurify.sanitize(parsedHtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'svg', 'form', 'input', 'img'],
    ALLOW_UNKNOWN_PROTOCOLS: false,
  });
}
