import type {
  AgentOption,
  AuthUser,
  ClassificationSuggestion,
  DraftReplySuggestion,
  KnowledgeArticleItem,
  ManagedUser,
  MessageVisibility,
  RequesterOption,
  TicketCategory,
  TicketDetailData,
  TicketMessageItem,
  TicketPriority,
  TicketStatus,
  TicketSummary,
  UserRole,
} from './types';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let inMemoryCsrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  inMemoryCsrfToken = token;
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

async function request<T>(
  path: string,
  options: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 15_000, headers: customHeaders, method = 'GET', body, ...rest } = options;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  const headers = new Headers(customHeaders);
  if (body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (method !== 'GET' && method !== 'HEAD' && inMemoryCsrfToken) {
    headers.set('X-CSRF-Token', inMemoryCsrfToken);
  }

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      body,
      headers,
      credentials: 'include',
      signal: controller.signal,
      ...rest,
    });

    const isJson = response.headers.get('content-type')?.includes('application/json');
    const payload = isJson ? ((await response.json()) as Record<string, unknown>) : null;

    if (!response.ok) {
      const errObj = payload?.error as
        { code?: string; message?: string; details?: Record<string, unknown> } | undefined;
      throw new ApiError(
        response.status,
        errObj?.code ?? 'HTTP_ERROR',
        errObj?.message ?? `Erro na comunicação com o servidor (HTTP ${response.status}).`,
        errObj?.details,
      );
    }

    return (payload ?? {}) as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError(
        408,
        'REQUEST_TIMEOUT',
        'A resposta do servidor demorou mais que o esperado. Verifique a conexão e tente novamente.',
      );
    }
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Não foi possível conectar ao servidor do RETORNO. Seu rascunho local foi preservado.',
    );
  } finally {
    window.clearTimeout(timer);
  }
}

export const api = {
  async login(email: string, password: string): Promise<{ user: AuthUser; csrfToken: string }> {
    const data = await request<{ user: AuthUser; csrfToken: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setCsrfToken(data.csrfToken);
    return data;
  },

  async me(): Promise<{ user: AuthUser; csrfToken: string }> {
    const data = await request<{ user: AuthUser; csrfToken: string }>('/api/auth/me');
    setCsrfToken(data.csrfToken);
    return data;
  },

  async logout(): Promise<void> {
    try {
      await request('/api/auth/logout', { method: 'POST', body: JSON.stringify({}) });
    } finally {
      setCsrfToken(null);
    }
  },

  async listTickets(params: {
    q?: string;
    status?: TicketStatus | 'ALL';
    priority?: TicketPriority | 'ALL';
    category?: TicketCategory | 'ALL';
    assigneeId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{
    items: TicketSummary[];
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
    statusCounts: Record<TicketStatus, number>;
  }> {
    const search = new URLSearchParams();
    if (params.q) search.set('q', params.q);
    if (params.status) search.set('status', params.status);
    if (params.priority) search.set('priority', params.priority);
    if (params.category) search.set('category', params.category);
    if (params.assigneeId) search.set('assigneeId', params.assigneeId);
    if (params.page) search.set('page', String(params.page));
    if (params.pageSize) search.set('pageSize', String(params.pageSize));
    return request(`/api/tickets?${search.toString()}`);
  },

  async getTicket(id: string): Promise<{ ticket: TicketDetailData }> {
    return request(`/api/tickets/${encodeURIComponent(id)}`);
  },

  async createTicket(payload: {
    subject: string;
    category: TicketCategory;
    description: string;
    priority?: TicketPriority;
    requesterId?: string;
  }): Promise<{ ticket: TicketSummary }> {
    return request('/api/tickets', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateTicket(
    id: string,
    payload: {
      expectedVersion: number;
      status?: TicketStatus;
      priority?: TicketPriority;
      category?: TicketCategory;
      assigneeId?: string | null;
    },
  ): Promise<{ ticket: TicketSummary }> {
    return request(`/api/tickets/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async sendMessage(
    id: string,
    payload: {
      body: string;
      visibility: MessageVisibility;
      idempotencyKey?: string;
      nextStatus?: 'IN_PROGRESS' | 'WAITING_CUSTOMER';
    },
  ): Promise<{
    message: TicketMessageItem;
    ticketVersion: number;
    status: TicketStatus;
    deduplicated: boolean;
  }> {
    return request(`/api/tickets/${encodeURIComponent(id)}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async resolveTicket(id: string, expectedVersion: number): Promise<{ ticket: TicketSummary }> {
    return request(`/api/tickets/${encodeURIComponent(id)}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ expectedVersion }),
    });
  },

  async reopenTicket(id: string, expectedVersion: number): Promise<{ ticket: TicketSummary }> {
    return request(`/api/tickets/${encodeURIComponent(id)}/reopen`, {
      method: 'POST',
      body: JSON.stringify({ expectedVersion }),
    });
  },

  async saveDraft(
    id: string,
    visibility: MessageVisibility,
    content: string,
  ): Promise<{
    draft: { visibility: MessageVisibility; content: string; updatedAt: string } | null;
  }> {
    return request(`/api/tickets/${encodeURIComponent(id)}/drafts`, {
      method: 'PUT',
      body: JSON.stringify({ visibility, content }),
    });
  },

  async clearDraft(id: string, visibility: MessageVisibility): Promise<void> {
    await request(`/api/tickets/${encodeURIComponent(id)}/drafts?visibility=${visibility}`, {
      method: 'DELETE',
    });
  },

  async listAgents(): Promise<{ agents: AgentOption[] }> {
    return request('/api/agents');
  },

  async listRequesters(): Promise<{ requesters: RequesterOption[] }> {
    return request('/api/requesters');
  },

  async listArticles(params: {
    q?: string;
    category?: TicketCategory | 'ALL';
    includeUnpublished?: boolean;
  }): Promise<{ articles: KnowledgeArticleItem[] }> {
    const search = new URLSearchParams();
    if (params.q) search.set('q', params.q);
    if (params.category) search.set('category', params.category);
    if (params.includeUnpublished) search.set('includeUnpublished', 'true');
    return request(`/api/kb/articles?${search.toString()}`);
  },

  async getArticle(slugOrId: string): Promise<{ article: KnowledgeArticleItem }> {
    return request(`/api/kb/articles/${encodeURIComponent(slugOrId)}`);
  },

  async createArticle(payload: {
    title: string;
    category: TicketCategory;
    summary: string;
    tags: string;
    bodyMarkdown: string;
    isPublished: boolean;
  }): Promise<{ article: KnowledgeArticleItem }> {
    return request('/api/kb/articles', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateArticle(
    id: string,
    payload: Partial<{
      title: string;
      category: TicketCategory;
      summary: string;
      tags: string;
      bodyMarkdown: string;
      isPublished: boolean;
    }>,
  ): Promise<{ article: KnowledgeArticleItem }> {
    return request(`/api/kb/articles/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async suggestClassification(
    ticketId: string,
    payload: { includeInternalNotes?: boolean; internalNotesReason?: string } = {},
  ): Promise<{ suggestion: ClassificationSuggestion }> {
    return request(`/api/tickets/${encodeURIComponent(ticketId)}/ai/classify`, {
      method: 'POST',
      body: JSON.stringify(payload),
      timeoutMs: 20_000,
    });
  },

  async prepareDraftReply(
    ticketId: string,
    payload: { includeInternalNotes?: boolean; internalNotesReason?: string } = {},
  ): Promise<{ draft: DraftReplySuggestion }> {
    return request(`/api/tickets/${encodeURIComponent(ticketId)}/ai/draft-reply`, {
      method: 'POST',
      body: JSON.stringify(payload),
      timeoutMs: 20_000,
    });
  },

  async listUsers(): Promise<{ users: ManagedUser[] }> {
    return request('/api/users');
  },

  async createUser(payload: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
    companyName: string;
  }): Promise<{ user: ManagedUser }> {
    return request('/api/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateUser(
    id: string,
    payload: Partial<{
      name: string;
      role: UserRole;
      companyName: string;
      isActive: boolean;
      password: string;
    }>,
  ): Promise<{ user: ManagedUser }> {
    return request(`/api/users/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
};
