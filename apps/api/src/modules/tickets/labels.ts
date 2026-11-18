import { TicketCategory, TicketPriority, TicketStatus } from '@prisma/client';

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
