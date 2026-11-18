export function stripControlCharacters(input: string): string {
  let out = '';
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)) {
      out += input[i];
    }
  }
  return out;
}

export function normalizePlainText(input: string): string {
  return stripControlCharacters(input).trim();
}

export function isAllowedUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('#') || trimmed.startsWith('/')) {
    return !trimmed.startsWith('//');
  }
  try {
    const parsed = new URL(trimmed);
    return (
      parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:'
    );
  } catch {
    return false;
  }
}

export function stripPromptControlSequences(input: string): string {
  return normalizePlainText(input)
    .replaceAll('</chamado_nao_confiavel>', '[tag-removida]')
    .replaceAll('<chamado_nao_confiavel>', '[tag-removida]')
    .replaceAll('</artigos_base>', '[tag-removida]')
    .replaceAll('<artigos_base>', '[tag-removida]');
}
