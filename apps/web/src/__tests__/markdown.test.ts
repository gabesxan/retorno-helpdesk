import { describe, expect, it } from 'vitest';
import { isSafeHref, renderSafeMarkdown } from '../lib/markdown';

describe('Sanitização de Markdown e proteção contra XSS', () => {
  it('bloqueia protocolos perigosos em links e preserva links seguros', () => {
    expect(isSafeHref('https://suporte.retorno.local/guia')).toBe(true);
    expect(isSafeHref('mailto:suporte@retorno.local')).toBe(true);
    expect(isSafeHref('#secao-1')).toBe(true);
    expect(isSafeHref('javascript:alert(1)')).toBe(false);
    expect(isSafeHref('  JaVaScRiPt:alert(1)')).toBe(false);
    expect(isSafeHref('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeHref('//evil.example/phish')).toBe(false);
  });

  it('neutraliza tags HTML, scripts e event handlers embutidos no Markdown', () => {
    const malicious = [
      'Texto normal',
      '<script>alert("xss")</script>',
      '<img src="x" onerror="alert(2)">',
      '<svg onload="alert(3)"></svg>',
      '[Clique aqui](javascript:alert(4))',
      '[Documentação](https://exemplo.com/manual)',
    ].join('\n\n');

    const html = renderSafeMarkdown(malicious);
    const container = document.createElement('div');
    container.innerHTML = html;

    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('javascript:');
    expect(container.querySelector('script, img, svg')).toBeNull();
    expect(container.querySelector('[onerror], [onload]')).toBeNull();
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('https://exemplo.com/manual');
  });
});
