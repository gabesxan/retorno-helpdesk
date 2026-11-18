import { formatShortDateTime } from '../lib/date';
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  type AgentOption,
  type TicketPriority,
  type TicketStatus,
  type TicketSummary,
  type UserRole,
} from '../lib/types';
import { IconPlus } from './Icons';

interface TicketQueueProps {
  role: UserRole;
  items: TicketSummary[];
  selectedId: string | null;
  loading: boolean;
  error: string | null;
  q: string;
  statusFilter: TicketStatus | 'ALL';
  priorityFilter: TicketPriority | 'ALL';
  assigneeFilter: string;
  agents: AgentOption[];
  page: number;
  totalPages: number;
  total: number;
  statusCounts: Record<TicketStatus, number>;
  onSearchChange: (val: string) => void;
  onStatusChange: (val: TicketStatus | 'ALL') => void;
  onPriorityChange: (val: TicketPriority | 'ALL') => void;
  onAssigneeChange: (val: string) => void;
  onPageChange: (nextPage: number) => void;
  onSelectTicket: (id: string) => void;
  onOpenNewModal: () => void;
  onRetry: () => void;
}

export function TicketQueue({
  role,
  items,
  selectedId,
  loading,
  error,
  q,
  statusFilter,
  priorityFilter,
  assigneeFilter,
  agents,
  page,
  totalPages,
  total,
  statusCounts,
  onSearchChange,
  onStatusChange,
  onPriorityChange,
  onAssigneeChange,
  onPageChange,
  onSelectTicket,
  onOpenNewModal,
  onRetry,
}: TicketQueueProps) {
  const isStaff = role === 'AGENT' || role === 'ADMIN';

  return (
    <section className="queue-pane" aria-label="Fila de chamados">
      <div className="pane-header">
        <div className="section-heading">
          <span className="section-num">01 //</span>
          <h1 className="section-title">Fila de chamados</h1>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={onOpenNewModal}>
          <IconPlus />
          <span>Novo chamado</span>
        </button>
      </div>

      <div className="queue-filters">
        <div
          style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}
          role="group"
          aria-label="Resumo por status"
        >
          <button
            type="button"
            className={`btn btn-sm ${statusFilter === 'ALL' ? 'btn-lime' : ''}`}
            onClick={() => onStatusChange('ALL')}
          >
            Todos (
            {statusCounts.OPEN +
              statusCounts.IN_PROGRESS +
              statusCounts.WAITING_CUSTOMER +
              statusCounts.RESOLVED}
            )
          </button>
          <button
            type="button"
            className={`btn btn-sm ${statusFilter === 'OPEN' ? 'btn-lime' : ''}`}
            onClick={() => onStatusChange('OPEN')}
          >
            Abertos ({statusCounts.OPEN})
          </button>
          <button
            type="button"
            className={`btn btn-sm ${statusFilter === 'IN_PROGRESS' ? 'btn-lime' : ''}`}
            onClick={() => onStatusChange('IN_PROGRESS')}
          >
            Atendimento ({statusCounts.IN_PROGRESS})
          </button>
          <button
            type="button"
            className={`btn btn-sm ${statusFilter === 'WAITING_CUSTOMER' ? 'btn-lime' : ''}`}
            onClick={() => onStatusChange('WAITING_CUSTOMER')}
          >
            Aguardando ({statusCounts.WAITING_CUSTOMER})
          </button>
        </div>

        <label className="field">
          <span className="sr-only">Buscar chamados</span>
          <input
            type="search"
            className="input"
            placeholder="Buscar código (RET-0001), assunto ou cliente..."
            value={q}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </label>

        <div className="filter-row">
          <label className="field">
            <span className="field-label">Status</span>
            <select
              className="select"
              value={statusFilter}
              onChange={(e) => onStatusChange(e.target.value as TicketStatus | 'ALL')}
            >
              <option value="ALL">Todos</option>
              <option value="OPEN">Aberto</option>
              <option value="IN_PROGRESS">Em atendimento</option>
              <option value="WAITING_CUSTOMER">Aguardando cliente</option>
              <option value="RESOLVED">Resolvido</option>
            </select>
          </label>

          <label className="field">
            <span className="field-label">Prioridade</span>
            <select
              className="select"
              value={priorityFilter}
              onChange={(e) => onPriorityChange(e.target.value as TicketPriority | 'ALL')}
            >
              <option value="ALL">Todas</option>
              <option value="URGENT">Urgente</option>
              <option value="HIGH">Alta</option>
              <option value="MEDIUM">Média</option>
              <option value="LOW">Baixa</option>
            </select>
          </label>
        </div>

        {isStaff && (
          <label className="field">
            <span className="field-label">Responsável</span>
            <select
              className="select"
              value={assigneeFilter}
              onChange={(e) => onAssigneeChange(e.target.value)}
            >
              <option value="ALL">Todos da equipe</option>
              <option value="MINE">Meus chamados</option>
              <option value="UNASSIGNED">Não atribuídos</option>
              {agents.map((ag) => (
                <option key={ag.id} value={ag.id}>
                  {ag.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="queue-list" role="list">
        {error && (
          <div style={{ padding: '12px' }}>
            <div className="alert alert-error" role="alert">
              <p>{error}</p>
              <button
                type="button"
                className="btn btn-sm"
                style={{ marginTop: '8px' }}
                onClick={onRetry}
              >
                Tentar novamente
              </button>
            </div>
          </div>
        )}

        {loading && items.length === 0 && (
          <p style={{ padding: '16px', color: 'var(--text-secondary)' }}>Carregando chamados...</p>
        )}

        {!loading && !error && items.length === 0 && (
          <div style={{ padding: '20px 14px', color: 'var(--text-secondary)' }}>
            <p style={{ fontWeight: 600 }}>Nenhum chamado encontrado</p>
            <p style={{ fontSize: '12.5px', marginTop: '4px' }}>
              Ajuste os filtros ou abra um novo chamado no botão acima.
            </p>
          </div>
        )}

        {items.map((ticket) => {
          const isSelected = ticket.id === selectedId;
          return (
            <button
              key={ticket.id}
              type="button"
              role="listitem"
              aria-current={isSelected ? 'true' : undefined}
              className={`queue-row ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelectTicket(ticket.id)}
            >
              <div className="queue-row-top">
                <span className="ticket-code">{ticket.code}</span>
                <span className="timeline-time">
                  {formatShortDateTime(ticket.lastInteractionAt)}
                </span>
              </div>

              <span className="queue-subject">{ticket.subject}</span>

              <div className="queue-meta">
                <span>{ticket.customerName}</span>
                <span>·</span>
                <span>{ticket.assignee?.name ?? 'Não atribuído'}</span>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                <span className={`badge badge-status-${ticket.status}`}>
                  {STATUS_LABELS[ticket.status]}
                </span>
                <span className={`badge badge-priority-${ticket.priority}`}>
                  {PRIORITY_LABELS[ticket.priority]}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="queue-footer">
        <span className="mono" style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
          {total} {total === 1 ? 'chamado' : 'chamados'} · pág. {page}/{totalPages}
        </span>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            type="button"
            className="btn btn-sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Anterior
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Próxima
          </button>
        </div>
      </div>
    </section>
  );
}
