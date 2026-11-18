import type { MessageVisibility } from './types';

const PREFIX = 'retorno_draft:';

function draftKey(userId: string, ticketId: string, visibility: MessageVisibility): string {
  return `${PREFIX}${userId}:${ticketId}:${visibility}`;
}

export function loadLocalDraft(
  userId: string,
  ticketId: string,
  visibility: MessageVisibility,
): string | null {
  try {
    return window.sessionStorage.getItem(draftKey(userId, ticketId, visibility));
  } catch {
    return null;
  }
}

export function saveLocalDraft(
  userId: string,
  ticketId: string,
  visibility: MessageVisibility,
  content: string,
): void {
  try {
    const key = draftKey(userId, ticketId, visibility);
    if (!content.trim()) {
      window.sessionStorage.removeItem(key);
    } else {
      window.sessionStorage.setItem(key, content);
    }
  } catch {
    // Armazenamento indisponível não impede uso do editor
  }
}

export function clearLocalDraft(
  userId: string,
  ticketId: string,
  visibility: MessageVisibility,
): void {
  try {
    window.sessionStorage.removeItem(draftKey(userId, ticketId, visibility));
  } catch {
    // Ignora
  }
}

export function clearAllUserDrafts(userId: string): void {
  try {
    const userPrefix = `${PREFIX}${userId}:`;
    const toDelete: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const k = window.sessionStorage.key(i);
      if (k && k.startsWith(userPrefix)) {
        toDelete.push(k);
      }
    }
    for (const k of toDelete) {
      window.sessionStorage.removeItem(k);
    }
  } catch {
    // Ignora
  }
}
