import { useMemo } from 'react';
import { renderSafeMarkdown } from '../lib/markdown';

interface SafeMarkdownProps {
  content: string;
  className?: string;
}

export function SafeMarkdown({ content, className }: SafeMarkdownProps) {
  const html = useMemo(() => renderSafeMarkdown(content), [content]);
  return (
    <div
      className={className ? `markdown-body ${className}` : 'markdown-body'}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
