export type UserRole = 'REQUESTER' | 'AGENT' | 'ADMIN';
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'RESOLVED';
export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type TicketCategory =
  | 'PRINTER_HARDWARE'
  | 'INVENTORY_REPORTS'
  | 'ACCESS_TERMINAL'
  | 'OPERATOR_SETUP'
  | 'FISCAL_POS'
  | 'OTHER';
export type MessageVisibility = 'PUBLIC' | 'INTERNAL';
export type MessageKind = 'MESSAGE' | 'EVENT';

export const STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: 'Aberto',
  IN_PROGRESS: 'Em atendimento',
  WAITING_CUSTOMER: 'Aguardando cliente',
  RESOLVED: 'Resolvido',
};

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};

export const CATEGORY_LABELS: Record<TicketCategory, string> = {
  PRINTER_HARDWARE: 'Impressora e Periféricos',
  INVENTORY_REPORTS: 'Estoque e Relatórios',
  ACCESS_TERMINAL: 'Acesso e Terminal',
  OPERATOR_SETUP: 'Cadastro de Operador',
  FISCAL_POS: 'PDV e Fiscal',
  OTHER: 'Outros',
};

export const ROLE_LABELS: Record<UserRole, string> = {
  REQUESTER: 'Solicitante',
  AGENT: 'Atendente',
  ADMIN: 'Administrador',
};

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  companyName: string;
  isActive: boolean;
}

export interface TicketSummary {
  id: string;
  code: string;
  subject: string;
  customerName: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  version: number;
  resolvedAt: string | null;
  lastInteractionAt: string;
  createdAt: string;
  updatedAt: string;
  requester: { id: string; name: string; companyName: string };
  assignee: { id: string; name: string } | null;
}

export interface TicketMessageItem {
  id: string;
  kind: MessageKind;
  visibility: MessageVisibility;
  body: string;
  createdAt: string;
  author: { id: string; name: string; role: UserRole };
}

export interface TicketDraftItem {
  visibility: MessageVisibility;
  content: string;
  updatedAt: string;
}

export interface TicketDetailData extends TicketSummary {
  requesterId: string;
  assigneeId: string | null;
  messages: TicketMessageItem[];
  drafts: TicketDraftItem[];
}

export interface AgentOption {
  id: string;
  name: string;
  role: UserRole;
}

export interface RequesterOption {
  id: string;
  name: string;
  companyName: string;
}

export interface KnowledgeArticleItem {
  id: string;
  slug: string;
  title: string;
  category: TicketCategory;
  summary: string;
  tags: string;
  bodyMarkdown: string;
  isPublished: boolean;
  updatedAt: string;
  author?: { id: string; name: string };
}

export interface ClassificationSuggestion {
  mode: 'gemini' | 'simulated';
  providerLabel: string;
  ticketId: string;
  ticketVersionAtStart: number;
  staleDuringGeneration: boolean;
  usedInternalNotes: boolean;
  suggestedCategory: TicketCategory;
  suggestedPriority: TicketPriority;
  justification: string;
}

export interface DraftCitation {
  articleId: string;
  slug: string;
  title: string;
  excerpt: string;
}

export interface DraftReplySuggestion {
  mode: 'gemini' | 'simulated';
  providerLabel: string;
  ticketId: string;
  ticketVersionAtStart: number;
  staleDuringGeneration: boolean;
  usedInternalNotes: boolean;
  sufficientDocumentation: boolean;
  limitationNotice: string | null;
  suggestedQuestion: string | null;
  draftText: string;
  citations: DraftCitation[];
}

export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  companyName: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}
