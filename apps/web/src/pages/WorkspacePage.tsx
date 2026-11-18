import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArticlePreviewModal } from '../components/ArticlePreviewModal';
import { NewTicketModal } from '../components/NewTicketModal';
import { TicketContextPanel } from '../components/TicketContextPanel';
import { TicketDetail, type TicketDetailHandle } from '../components/TicketDetail';
import { TicketQueue } from '../components/TicketQueue';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import type {
  AgentOption,
  TicketDetailData,
  TicketPriority,
  TicketStatus,
  TicketSummary,
} from '../lib/types';

export function WorkspacePage() {
  const { user } = useAuth();
  const { ticketId } = useParams<{ ticketId?: string }>();
  const navigate = useNavigate();

  const isStaff = user?.role === 'AGENT' || user?.role === 'ADMIN';

  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'ALL'>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | 'ALL'>('ALL');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('ALL');
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<TicketSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [statusCounts, setStatusCounts] = useState<Record<TicketStatus, number>>({
    OPEN: 0,
    IN_PROGRESS: 0,
    WAITING_CUSTOMER: 0,
    RESOLVED: 0,
  });
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState<string | null>(null);

  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<TicketDetailData | null>(null);
  const [loadedTicketId, setLoadedTicketId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [contextOpen, setContextOpen] = useState(false);
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [previewArticleSlug, setPreviewArticleSlug] = useState<string | null>(null);
  const ticketDetailRef = useRef<TicketDetailHandle>(null);

  useEffect(() => {
    if (!isStaff) return;
    api
      .listAgents()
      .then((res) => setAgents(res.agents))
      .catch(() => {
        // Ignora falha não-bloqueante ao listar atendentes
      });
  }, [isStaff]);

  const loadQueue = useCallback(async () => {
    setQueueLoading(true);
    setQueueError(null);
    try {
      const res = await api.listTickets({
        q: q.trim() || undefined,
        status: statusFilter,
        priority: priorityFilter,
        assigneeId: isStaff ? assigneeFilter : undefined,
        page,
        pageSize: 15,
      });
      setItems(res.items);
      setTotal(res.pagination.total);
      setTotalPages(res.pagination.totalPages);
      setStatusCounts(res.statusCounts);

      if (!ticketId && res.items.length > 0 && window.innerWidth > 900) {
        navigate(`/chamados/${res.items[0]!.id}`, { replace: true });
      }
    } catch (err: unknown) {
      setQueueError(err instanceof Error ? err.message : 'Não foi possível carregar a fila.');
    } finally {
      setQueueLoading(false);
    }
  }, [q, statusFilter, priorityFilter, assigneeFilter, isStaff, page, ticketId, navigate]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadQueue();
    }, 150);
    return () => window.clearTimeout(timer);
  }, [loadQueue]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const res = await api.getTicket(id);
      setSelectedTicket(res.ticket);
      setDetailError(null);
      setLoadedTicketId(id);
    } catch (err: unknown) {
      setSelectedTicket(null);
      setDetailError(err instanceof Error ? err.message : 'Erro ao abrir o chamado.');
      setLoadedTicketId(id);
    }
  }, []);

  useEffect(() => {
    if (!ticketId) return;
    let active = true;
    api
      .getTicket(ticketId)
      .then((res) => {
        if (!active) return;
        setSelectedTicket(res.ticket);
        setDetailError(null);
        setLoadedTicketId(ticketId);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setSelectedTicket(null);
        setDetailError(err instanceof Error ? err.message : 'Erro ao abrir o chamado.');
        setLoadedTicketId(ticketId);
      });
    return () => {
      active = false;
    };
  }, [ticketId]);

  if (!user) return null;

  const activeTicket = ticketId && selectedTicket?.id === ticketId ? selectedTicket : null;
  const detailLoading = Boolean(ticketId && loadedTicketId !== ticketId);
  const activeDetailError = ticketId && loadedTicketId === ticketId ? detailError : null;

  const handleRefreshAll = async () => {
    await loadQueue();
    if (ticketId) {
      await loadDetail(ticketId);
    }
  };

  const mobileView = ticketId ? 'detail' : 'list';

  return (
    <div
      className={`workspace-grid ${contextOpen && activeTicket ? 'with-context' : ''}`}
      data-mobile-view={mobileView}
    >
      <TicketQueue
        role={user.role}
        items={items}
        selectedId={ticketId ?? null}
        loading={queueLoading}
        error={queueError}
        q={q}
        statusFilter={statusFilter}
        priorityFilter={priorityFilter}
        assigneeFilter={assigneeFilter}
        agents={agents}
        page={page}
        totalPages={totalPages}
        total={total}
        statusCounts={statusCounts}
        onSearchChange={(val) => {
          setQ(val);
          setPage(1);
        }}
        onStatusChange={(val) => {
          setStatusFilter(val);
          setPage(1);
        }}
        onPriorityChange={(val) => {
          setPriorityFilter(val);
          setPage(1);
        }}
        onAssigneeChange={(val) => {
          setAssigneeFilter(val);
          setPage(1);
        }}
        onPageChange={setPage}
        onSelectTicket={(id) => navigate(`/chamados/${id}`)}
        onOpenNewModal={() => setNewModalOpen(true)}
        onRetry={() => void loadQueue()}
      />

      <TicketDetail
        key={activeTicket?.id ?? 'empty'}
        ref={ticketDetailRef}
        ticket={activeTicket}
        loading={detailLoading}
        error={activeDetailError}
        currentUserId={user.id}
        role={user.role}
        contextOpen={contextOpen}
        onToggleContext={() => setContextOpen((v) => !v)}
        onBackMobile={() => navigate('/chamados')}
        onRefresh={handleRefreshAll}
      />

      {contextOpen && activeTicket && (
        <TicketContextPanel
          key={activeTicket.id}
          ticket={activeTicket}
          role={user.role}
          agents={agents}
          onClosePanel={() => setContextOpen(false)}
          onTicketUpdated={handleRefreshAll}
          onInsertAiDraft={(text) => ticketDetailRef.current?.injectPublicDraft(text)}
          onPreviewArticle={(slug) => setPreviewArticleSlug(slug)}
        />
      )}

      <NewTicketModal
        open={newModalOpen}
        role={user.role}
        onClose={() => setNewModalOpen(false)}
        onCreated={(created) => {
          void loadQueue();
          navigate(`/chamados/${created.id}`);
        }}
      />

      {previewArticleSlug && (
        <ArticlePreviewModal
          key={previewArticleSlug}
          slugOrId={previewArticleSlug}
          onClose={() => setPreviewArticleSlug(null)}
        />
      )}
    </div>
  );
}
